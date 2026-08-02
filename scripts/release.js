import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync, spawnSync } from 'node:child_process';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_NOTES_INSTRUCTIONS_PATTERN =
    /<!-- release-notes-editor:instructions:start -->[\s\S]*?<!-- release-notes-editor:instructions:end -->\s*/;
const cliArgs = parseArgs(process.argv.slice(2));
const pipedAnswers = process.stdin.isTTY ? null : readFileSync(0, 'utf8').split(/\r?\n/);
const promptInterface = process.stdin.isTTY && !cliArgs.yes
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

function parseArgs(args) {
    const result = { version: '', summary: '', notesFile: '', yes: false };
    for (let index = 0; index < args.length; index += 1) {
        const value = args[index];
        if (value === '--yes' || value === '-y') {
            result.yes = true;
        } else if (value === '--version') {
            result.version = args[++index] || '';
        } else if (value === '--summary') {
            result.summary = args[++index] || '';
        } else if (value === '--notes-file') {
            result.notesFile = args[++index] || '';
        } else {
            throw new Error(`Unknown release argument: ${value}`);
        }
    }
    return result;
}

async function readJsonFile(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonFile(filePath, jsonData) {
    await fs.writeFile(filePath, `${JSON.stringify(jsonData, null, 2)}\n`, 'utf8');
}

function promptUser(query) {
    if (cliArgs.yes) return Promise.resolve('y');
    if (pipedAnswers) {
        process.stdout.write(query);
        return Promise.resolve(pipedAnswers.shift() ?? '');
    }
    return new Promise((resolve) => promptInterface.question(query, resolve));
}

function closePrompt() {
    promptInterface?.close();
}

function parseVersion(version) {
    const match = VERSION_PATTERN.exec(String(version).trim());
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function assertValidVersion(version, label = 'version') {
    const parsed = parseVersion(version);
    if (!parsed) throw new Error(`${label} must use a.b.c format, got: ${version}`);
    return parsed;
}

function compareVersions(a, b) {
    const left = assertValidVersion(a, 'left version');
    const right = assertValidVersion(b, 'right version');
    for (const key of ['major', 'minor', 'patch']) {
        if (left[key] > right[key]) return 1;
        if (left[key] < right[key]) return -1;
    }
    return 0;
}

function incrementVersion(version, type) {
    const next = assertValidVersion(version);
    if (type === 'major') {
        next.major += 1;
        next.minor = 0;
        next.patch = 0;
    } else if (type === 'minor') {
        next.minor += 1;
        next.patch = 0;
    } else if (type === 'patch') {
        next.patch += 1;
    }
    return `${next.major}.${next.minor}.${next.patch}`;
}

function normalizeSummary(summary) {
    return String(summary || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeNotes(notes, version) {
    const normalized = String(notes || '').replace(/\\n/g, '\n').trim();
    return normalized || `Release v${version}`;
}

function run(command, args, options = {}) {
    console.log(`\n[release] $ ${[command, ...args].join(' ')}`);
    execFileSync(command, args, { stdio: 'inherit', ...options });
}

function runPnpm(args) {
    console.log(`\n[release] $ ${['pnpm', ...args].join(' ')}`);
    if (process.platform === 'win32') {
        execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['pnpm', ...args].join(' ')], { stdio: 'inherit' });
    } else {
        execFileSync('pnpm', args, { stdio: 'inherit' });
    }
}

function getOutput(command, args) {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commandSucceeds(command, args) {
    try {
        execFileSync(command, args, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function ensureMainBranch() {
    const branch = getOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== 'main') throw new Error(`Release must run from main, current branch is: ${branch}`);
}

function ensureMainCanPush() {
    const localHead = getOutput('git', ['rev-parse', 'HEAD']);
    const remoteHead = getOutput('git', ['rev-parse', 'origin/main']);
    if (localHead === remoteHead) return;
    if (!commandSucceeds('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])) {
        throw new Error('Local main is behind or diverged from origin/main. Pull or rebase before releasing.');
    }
}

function ensureTagDoesNotExist(version) {
    const tag = `v${version}`;
    if (commandSucceeds('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`])) {
        throw new Error(`Local tag already exists: ${tag}`);
    }
    if (commandSucceeds('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`])) {
        throw new Error(`Remote tag already exists: ${tag}`);
    }
}

function getGitStatus() {
    try {
        return getOutput('git', ['status', '--short']);
    } catch {
        return '';
    }
}

function resolveGitPath(fileName) {
    const gitPath = getOutput('git', ['rev-parse', '--git-path', fileName]);
    return path.isAbsolute(gitPath) ? gitPath : path.resolve(process.cwd(), gitPath);
}

function getPreviousReleaseTag(currentVersion) {
    const currentTag = `v${currentVersion}`;
    if (
        commandSucceeds('git', ['show-ref', '--verify', '--quiet', `refs/tags/${currentTag}`])
        && commandSucceeds('git', ['merge-base', '--is-ancestor', currentTag, 'HEAD'])
    ) {
        return currentTag;
    }

    try {
        return getOutput('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD']);
    } catch {
        return '';
    }
}

function getCommitsSinceTag(previousTag) {
    if (!previousTag) return [];

    const output = getOutput('git', [
        'log',
        '--reverse',
        '--format=%H%x1f%h%x1f%s%x1f%b%x1e',
        `${previousTag}..HEAD`,
    ]);
    if (!output) return [];

    return output
        .split('\x1e')
        .map((record) => record.trim())
        .filter(Boolean)
        .map((record) => {
            const [hash = '', shortHash = '', subject = '', ...bodyParts] = record.split('\x1f');
            return {
                hash,
                shortHash,
                subject: subject.trim(),
                body: bodyParts.join('\x1f').trim(),
            };
        });
}

function formatCommitAsReleaseNote(commit) {
    const subject = commit.subject || `Commit ${commit.shortHash}`;
    const lines = [`- ${subject} (\`${commit.shortHash}\`)`];
    if (commit.body) {
        lines.push('');
        lines.push(...commit.body.split(/\r?\n/).map((line) => line ? `  ${line}` : ''));
    }
    return lines.join('\n');
}

function createGeneratedReleaseNotes(version, commits) {
    return commits.length > 0
        ? commits.map(formatCommitAsReleaseNote).join('\n\n')
        : `- Release v${version}`;
}

function createReleaseNotesDraft(version, previousTag, commits) {
    const rangeLabel = previousTag ? `${previousTag}..HEAD` : '未找到可用的上一 release tag';

    return [
        '<!-- release-notes-editor:instructions:start -->',
        '请在下方编辑本次发布的详细更新日志。',
        '每个一级无序列表项对应一次提交；可以增删、合并或重写内容。',
        '保存并关闭此文件后，release 流程会自动继续。',
        '本说明块不会进入 Git commit、tag 或 GitHub Release。',
        `自动生成范围：${rangeLabel}`,
        `检测到提交数：${commits.length}`,
        '<!-- release-notes-editor:instructions:end -->',
        '',
        createGeneratedReleaseNotes(version, commits),
        '',
    ].join('\n');
}

function parseEditorCommand(editorCommand) {
    const parts = String(editorCommand || '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    return parts.map((part) => {
        if (
            (part.startsWith('"') && part.endsWith('"'))
            || (part.startsWith("'") && part.endsWith("'"))
        ) {
            return part.slice(1, -1);
        }
        return part;
    });
}

function getOptionalOutput(command, args) {
    try {
        return getOutput(command, args);
    } catch {
        return '';
    }
}

function resolveReleaseEditor() {
    const configuredEditor =
        process.env.RELEASE_EDITOR
        || process.env.GIT_EDITOR
        || getOptionalOutput('git', ['config', '--get', 'core.editor'])
        || process.env.VISUAL
        || process.env.EDITOR;
    if (configuredEditor) return configuredEditor;

    if (process.env.TERM_PROGRAM === 'vscode') return 'code --wait';

    const hasCodeCommand = process.platform === 'win32'
        ? commandSucceeds('where.exe', ['code'])
        : commandSucceeds('sh', ['-c', 'command -v code >/dev/null 2>&1']);
    if (hasCodeCommand) return 'code --wait';

    return process.platform === 'win32' ? 'notepad.exe' : 'vi';
}

function openReleaseNotesEditor(filePath) {
    const editorParts = parseEditorCommand(resolveReleaseEditor());
    if (editorParts.length === 0) {
        throw new Error('No release notes editor is configured.');
    }

    const [editorCommand, ...editorArgs] = editorParts;
    const editorName = path.basename(editorCommand).toLowerCase();
    if (
        /^(code|code-insiders|codium)(?:\.cmd|\.exe)?$/.test(editorName)
        && !editorArgs.includes('--wait')
    ) {
        editorArgs.push('--wait');
    }

    console.log(`\n[release] Opening release notes editor: ${filePath}`);
    console.log('[release] Save and close the editor file to continue.');
    promptInterface?.pause();
    try {
        const extension = path.extname(editorCommand).toLowerCase();
        const needsShell = process.platform === 'win32'
            && (!extension || extension === '.cmd' || extension === '.bat');
        const result = spawnSync(editorCommand, [...editorArgs, filePath], {
            stdio: 'inherit',
            shell: needsShell,
        });
        if (result.error) throw result.error;
        if (result.status !== 0) {
            throw new Error(`Release notes editor exited with status ${result.status ?? 'unknown'}.`);
        }
    } finally {
        promptInterface?.resume();
    }
}

async function editReleaseNotes(version, previousTag, commits) {
    const releaseNotesPath = resolveGitPath('RELEASE_NOTES.md');
    await fs.writeFile(
        releaseNotesPath,
        createReleaseNotesDraft(version, previousTag, commits),
        'utf8',
    );

    openReleaseNotesEditor(releaseNotesPath);

    const editedNotes = await fs.readFile(releaseNotesPath, 'utf8');
    const releaseNotes = editedNotes
        .replace(RELEASE_NOTES_INSTRUCTIONS_PATTERN, '')
        .trim();
    return {
        releaseNotes: normalizeNotes(releaseNotes, version),
        releaseNotesPath,
    };
}

async function writeReleaseGitMessageFiles(commitSubject, tagTitle, releaseNotes) {
    const commitMessagePath = resolveGitPath('RELEASE_COMMIT_MESSAGE.txt');
    const tagMessagePath = resolveGitPath('RELEASE_TAG_MESSAGE.txt');
    await fs.writeFile(commitMessagePath, `${commitSubject}\n\n${releaseNotes}\n`, 'utf8');
    await fs.writeFile(tagMessagePath, `${tagTitle}\n\n${releaseNotes}\n`, 'utf8');
    return { commitMessagePath, tagMessagePath };
}

async function selectVersion(currentVersion) {
    if (cliArgs.version) return cliArgs.version.trim();
    console.log(`\n[release] Current version: ${currentVersion}\n`);
    console.log(`   1. Patch version  (${incrementVersion(currentVersion, 'patch')})`);
    console.log(`   2. Minor version  (${incrementVersion(currentVersion, 'minor')})`);
    console.log(`   3. Major version  (${incrementVersion(currentVersion, 'major')})`);
    console.log('   4. Input version manually');
    console.log('   0. Quit without releasing\n');
    const choice = (await promptUser('Please choose (1/2/3/4/0): ')).trim();
    if (choice === '1') return incrementVersion(currentVersion, 'patch');
    if (choice === '2') return incrementVersion(currentVersion, 'minor');
    if (choice === '3') return incrementVersion(currentVersion, 'major');
    if (choice === '4') return (await promptUser('Please enter the new version (a.b.c): ')).trim();
    return '';
}

async function loadReleaseNotes(version, previousTag, commits) {
    if (cliArgs.notesFile) {
        const releaseNotesPath = path.resolve(cliArgs.notesFile);
        return {
            releaseNotes: normalizeNotes(await fs.readFile(releaseNotesPath, 'utf8'), version),
            releaseNotesPath,
        };
    }
    if (cliArgs.yes) {
        return {
            releaseNotes: normalizeNotes(createGeneratedReleaseNotes(version, commits), version),
            releaseNotesPath: 'generated from git log',
        };
    }
    if (pipedAnswers) {
        const releaseNotesPath = resolveGitPath('RELEASE_NOTES.md');
        await fs.writeFile(releaseNotesPath, createReleaseNotesDraft(version, previousTag, commits), 'utf8');
        const pipedNotes = pipedAnswers.shift() ?? '';
        if (pipedNotes.trim()) {
            await fs.writeFile(releaseNotesPath, normalizeNotes(pipedNotes, version), 'utf8');
        }
        const editedNotes = await fs.readFile(releaseNotesPath, 'utf8');
        const releaseNotes = editedNotes
            .replace(RELEASE_NOTES_INSTRUCTIONS_PATTERN, '')
            .trim();
        console.log(`\n[release] Non-interactive mode: using release notes from ${releaseNotesPath}`);
        return {
            releaseNotes: normalizeNotes(releaseNotes, version),
            releaseNotesPath,
        };
    }
    return editReleaseNotes(version, previousTag, commits);
}

async function restoreVersionFiles(files, originals) {
    await fs.writeFile(files.pluginJsonPath, originals.pluginJson, 'utf8');
    await fs.writeFile(files.packageJsonPath, originals.packageJson, 'utf8');
}

(async function release() {
    const root = process.cwd();
    const pluginJsonPath = path.join(root, 'plugin.json');
    const packageJsonPath = path.join(root, 'package.json');
    const files = { pluginJsonPath, packageJsonPath };
    const originals = {
        pluginJson: await fs.readFile(pluginJsonPath, 'utf8'),
        packageJson: await fs.readFile(packageJsonPath, 'utf8'),
    };
    let versionFilesWritten = false;
    let committed = false;

    try {
        getOutput('git', ['rev-parse', '--is-inside-work-tree']);
        ensureMainBranch();

        const pluginData = await readJsonFile(pluginJsonPath);
        const packageData = await readJsonFile(packageJsonPath);
        assertValidVersion(pluginData.version, 'plugin.json version');
        assertValidVersion(packageData.version, 'package.json version');
        if (pluginData.version !== packageData.version) {
            throw new Error(`Version mismatch: plugin.json=${pluginData.version}, package.json=${packageData.version}`);
        }

        const currentVersion = pluginData.version;
        const newVersion = await selectVersion(currentVersion);
        if (!newVersion) {
            console.log('\n[release] Release cancelled.');
            return;
        }
        assertValidVersion(newVersion, 'new version');
        if (compareVersions(newVersion, currentVersion) <= 0) {
            throw new Error(`New version must be greater than ${currentVersion}, got ${newVersion}`);
        }

        if (!cliArgs.summary && !cliArgs.yes) {
            console.log('\n[release] Enter this release update summary.');
            console.log('[release] This will be used in the git commit title, tag title, and GitHub Release title.');
            console.log('[release] Leave empty to use only the version number.');
        }
        const summary = normalizeSummary(cliArgs.summary || (cliArgs.yes ? '' : await promptUser('Release summary: ')));
        const suffix = summary ? ` - ${summary}` : '';
        const commitSubject = `release: v${newVersion}${suffix}`;
        const tagTitle = `v${newVersion}${suffix}`;

        run('git', ['fetch', 'origin', 'main', '--tags']);
        ensureMainCanPush();
        ensureTagDoesNotExist(newVersion);

        const previousReleaseTag = getPreviousReleaseTag(currentVersion);
        const releaseCommits = getCommitsSinceTag(previousReleaseTag);
        console.log(`\n[release] Preparing detailed release notes from ${previousReleaseTag || 'no previous tag'}.`);
        console.log(`[release] Found ${releaseCommits.length} commit(s) to prefill.`);
        const {
            releaseNotes,
            releaseNotesPath,
        } = await loadReleaseNotes(newVersion, previousReleaseTag, releaseCommits);

        const status = getGitStatus();
        if (status) {
            console.log('\n[release] Changes that will be included in the release commit:\n');
            console.log(status);
            if (!cliArgs.yes && (await promptUser('\nInclude these changes? (y/N): ')).trim().toLowerCase() !== 'y') return;
        }

        console.log('\n[release] Release metadata preview:');
        console.log(`   Commit: ${commitSubject}`);
        console.log(`   Tag:    ${tagTitle}`);
        console.log(`   File:   ${releaseNotesPath}`);
        console.log(`   Notes:  ${releaseNotes.split('\n')[0]}${releaseNotes.includes('\n') ? ' ...' : ''}`);
        if (!cliArgs.yes && (await promptUser(`Build, commit, tag, and release v${newVersion}? (y/N): `)).trim().toLowerCase() !== 'y') return;

        pluginData.version = newVersion;
        packageData.version = newVersion;
        await writeJsonFile(pluginJsonPath, pluginData);
        await writeJsonFile(packageJsonPath, packageData);
        versionFilesWritten = true;

        runPnpm(['install', '--frozen-lockfile']);
        runPnpm(['build']);

        const packagePath = path.join(root, 'package.zip');
        const packageStat = await fs.stat(packagePath);
        if (!packageStat.isFile() || packageStat.size === 0) throw new Error('package.zip was not generated correctly.');
        console.log(`[release] package.zip verified (${packageStat.size} bytes).`);

        run('git', ['add', '-A']);
        if (commandSucceeds('git', ['diff', '--cached', '--quiet'])) throw new Error('Nothing staged for release commit.');

        const {
            commitMessagePath,
            tagMessagePath,
        } = await writeReleaseGitMessageFiles(commitSubject, tagTitle, releaseNotes);

        run('git', ['commit', '-F', commitMessagePath]);
        committed = true;
        run('git', ['tag', '-a', `v${newVersion}`, '-F', tagMessagePath]);
        await fs.rm(commitMessagePath, { force: true });
        await fs.rm(tagMessagePath, { force: true });

        run('git', ['push', 'origin', 'main']);
        run('git', ['push', 'origin', `v${newVersion}`]);
        console.log(`\n[release] v${newVersion} pushed. GitHub Actions will publish package.zip.`);
    } catch (error) {
        if (versionFilesWritten && !committed) await restoreVersionFiles(files, originals);
        console.error('\n[release] Release failed:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    } finally {
        closePrompt();
    }
})();
