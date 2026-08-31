export type Task = {
  id: string;
  title: string;
  desc: string;
  /** 선배가 덧붙이는 한마디. 없으면 null */
  tip: string | null;
  /** 건너뛰면 안 되는 항목 (위생·안전) */
  critical: boolean;
  imageUrl: string | null;
  /** 유튜브 '일부공개' 링크를 그대로 넣으면 된다 */
  videoUrl: string | null;
};

export type Section = {
  id: string;
  title: string;
  note: string | null;
  tasks: Task[];
};

export type Position = {
  id: string;
  /** 공유 링크의 주소가 되는 값: /p/{shareSlug} */
  shareSlug: string;
  name: string;
  subtitle: string;
  summary: string;
  sections: Section[];
};

export type Store = {
  id: string;
  name: string;
  slug: string;
};

export type SeedData = {
  store: Store;
  positions: Position[];
};
