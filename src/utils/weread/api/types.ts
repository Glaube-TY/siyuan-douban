export type WereadApiName =
  | "/_list"
  | "/store/search"
  | "/book/info"
  | "/book/chapterinfo"
  | "/book/getprogress"
  | "/shelf/sync"
  | "/user/notebooks"
  | "/book/bookmarklist"
  | "/review/list/mine"
  | "/book/bestbookmarks"
  | "/book/underlines"
  | "/book/readreviews"
  | "/review/single"
  | "/review/list"
  | "/readdata/detail"
  | "/book/recommend"
  | "/book/similar";

export interface WereadAuthSettings {
  provider: "apiKey";
  apiKey: string;
  verified: boolean;
  verifiedAt?: number;
  apiProtocolVersion: string;
  lastError?: string;
}
