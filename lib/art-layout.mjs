/**
 * Group art items into rows for display in Art gallery.
 * @param {Array} items - Raw gallery items array
 * @returns {Array<Array>} Array of rows, where each row is an array of items with `_flatIndex`
 */
export function groupArtRows(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const list = items.filter((item) => item?.image);
  if (list.length === 0) {
    return [];
  }

  const itemsWithFlatIndex = list.map((item, index) => ({
    ...item,
    _flatIndex: index,
  }));

  const hasAnyBreak = itemsWithFlatIndex.some((item) => Boolean(item.breakBefore));

  if (!hasAnyBreak) {
    const rows = [];
    for (let i = 0; i < itemsWithFlatIndex.length; i += 3) {
      rows.push(itemsWithFlatIndex.slice(i, i + 3));
    }
    return rows;
  }

  const rows = [];
  let currentRow = [];

  itemsWithFlatIndex.forEach((item, index) => {
    if (index > 0 && item.breakBefore) {
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRow = [item];
    } else {
      currentRow.push(item);
    }
  });

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}
