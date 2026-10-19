import type { BrowserContext, Page } from 'playwright';

export type PlatformName = 'bunjang' | 'joongna';

export const STATUS = {
  selling: 'selling',
  reserved: 'reserved',
  sold: 'sold',
  hidden: 'hidden',
  unknown: 'unknown',
} as const;

export type ProductStatus = (typeof STATUS)[keyof typeof STATUS];

/** 두 플랫폼의 상품을 같은 형태로 다루기 위한 공통 모양. */
export interface Product {
  platform: PlatformName;
  id: string;
  title: string;
  titleKey: string;
  price: number | null;
  status: ProductStatus;
  url: string | null;
  images: string[];
  description: string | null;
}

/** 등록·수정에 필요한 추가 정보. 목록만으로는 알 수 없어 상세 화면에서 읽는다. */
export interface ProductDetail {
  id: string;
  title: string | null;
  description: string | null;
  price: number | null;
  images: string[];
  imageFiles?: string[];
  category?: string | null;
  categoryCode?: string | null;
  condition?: string | null;
  shipping?: string | null;
  tags?: string[];
}

export interface Account {
  nickname: string | null;
  productIds?: string[];
}

/** 기준 상점과 대상 상점이 지켜야 할 최소 규약. 화면 지식은 각 구현에만 둔다. */
export interface PlatformAdapter {
  readonly name: PlatformName;
  readonly label: string;
  readAccount(page: Page): Promise<Account>;
  collectList(page: Page, options: CollectOptions): Promise<Product[]>;
  collectDetail(page: Page, id: string): Promise<ProductDetail>;
}

/** 기준 상점에서만 필요한 기능. */
export interface SourceAdapter extends PlatformAdapter {
  hideProduct(page: Page, id: string): Promise<StatusResult>;
  downloadImages(context: BrowserContext, id: string, urls: string[], limit?: number): Promise<string[]>;
  ownsShop(page: Page, shopId: string, productIds: string[]): Promise<ShopCheck | null>;
}

/** 대상 상점에서만 필요한 기능. */
export interface TargetAdapter extends PlatformAdapter {
  createProduct(page: Page, draft: ProductDraft, options?: WriteOptions): Promise<CreateResult>;
  updateProduct(page: Page, id: string, patch: ProductPatch, options?: WriteOptions): Promise<WriteResult>;
  setStatus(page: Page, id: string, status: ProductStatus): Promise<StatusResult>;
}

export interface CollectOptions {
  /** 목록 한 페이지에 요청할 상품 수 (번개장터 표) */
  pageSize: number;
  /** 넘길 최대 페이지 수 (번개장터 표) */
  maxPages: number;
  /** 무한 스크롤을 내릴 최대 횟수 (중고나라 내 상점) */
  maxScrolls: number;
}

export interface WriteOptions {
  dryRun?: boolean;
}

export interface ProductDraft {
  title: string;
  price: number | null;
  description: string;
  images: string[];
  categoryPath: string;
  condition: 'used' | 'new';
  components: 'none' | 'partial' | 'full';
  freeShipping: boolean;
}

export type ProductPatch = Partial<Pick<Product, 'title' | 'price' | 'description'>>;

export interface WriteResult {
  id: string | null;
  url: string;
  dryRun?: boolean;
  filled?: Record<string, unknown>;
}

export type CreateResult = WriteResult;

export interface StatusResult {
  id: string;
  status: ProductStatus;
  appliedAt: string;
}

export interface ShopCheck {
  matched: number;
  shopProducts: number;
}

export interface ProductLink {
  bunjangId: string;
  joongnaId: string;
  title: string | null;
  origin: 'confirmed' | 'created';
  linkedAt: string;
}

export interface LinkStore {
  version: number;
  updatedAt: string | null;
  links: ProductLink[];
}

export type ActionType = 'create' | 'update' | 'markSold' | 'hide' | 'hideSource' | 'reserve';

export interface FieldChange {
  field: 'title' | 'price' | 'description';
  from: string | number | null;
  to: string | number | null;
}

export interface PlanAction {
  type: ActionType;
  bunjang: Product;
  joongna?: Product;
  link?: Pick<ProductLink, 'bunjangId' | 'joongnaId'>;
  changes?: FieldChange[];
}

export interface MatchCandidate extends Product {
  score: number;
  samePrice: boolean;
}

export interface Plan {
  createdAt: string;
  snapshotAt?: string;
  counts: Record<string, number>;
  actions: PlanAction[];
  candidates: { bunjang: Product; matches: MatchCandidate[]; reason: string }[];
  skipped: { bunjang?: Product; joongna?: Product; link?: PlanAction['link']; reason: string }[];
  orphans: { joongna: Product; reason: string }[];
}

export interface Snapshot {
  collectedAt: string;
  sourceProducts: Product[];
  targetProducts: Product[];
  details: Record<string, ProductDetail>;
  targetDetails: Record<string, ProductDetail>;
}

export type ApplyStatus = 'done' | 'skipped' | 'failed' | 'unknown' | 'dry-run';

export interface ApplyResult {
  type: ActionType;
  bunjangId: string;
  title: string;
  joongnaId: string | null;
  status: ApplyStatus;
  reason?: string;
  error?: string;
  url?: string;
  filled?: Record<string, unknown>;
}

export interface SyncConfig {
  title: boolean;
  price: boolean;
  description: boolean;
  hideSource: boolean;
}

export interface AppConfig {
  source: { platform: PlatformName; shopId: string; url: string; shopUrl?: string };
  target: { platform: PlatformName; url: string };
  collect: CollectOptions;
  sync: SyncConfig;
  joongna: { condition: 'used' | 'new'; components: 'none' | 'partial' | 'full'; freeShipping: boolean };
  categoryMap: Record<string, string>;
}
