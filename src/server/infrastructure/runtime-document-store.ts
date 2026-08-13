export type RuntimeDocument<T> = {
  revision: number;
  payload: T;
};

export type RuntimeDocumentStore = {
  read<T>(namespace: string, initial: T): Promise<RuntimeDocument<T>>;
  compareAndSwap<T>(
    namespace: string,
    expectedRevision: number,
    payload: T
  ): Promise<{ committed: boolean; revision: number }>;
};
