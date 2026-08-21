export async function mapWithConcurrency<TInput, TResult>(
  items: readonly TInput[],
  limit: number,
  mapper: (item: TInput) => Promise<TResult>
) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Giới hạn xử lý thông báo không hợp lệ.");
  }
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}
