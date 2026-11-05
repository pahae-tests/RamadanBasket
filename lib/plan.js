export function buildPlan(selected, vendors) {
  const assignment = {};
  let cursor = 0;
  for (const vendor of vendors) {
    const qty = Number(vendor.qty) || 0;
    for (let i = 0; i < qty && cursor < selected.length; i++) {
      assignment[selected[cursor].id] = vendor.id;
      cursor += 1;
    }
  }
  return assignment;
}

export function countByVendor(selected, assignment) {
  const counts = {};
  for (const family of selected) {
    const vendorId = assignment[family.id];
    if (vendorId) counts[vendorId] = (counts[vendorId] || 0) + 1;
  }
  return counts;
}
