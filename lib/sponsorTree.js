const { query } = require("./db");
const { canHaveFamilies, canHaveChildren } = require("./sponsorRules");

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

async function loadSponsorNodes() {
  const [sponsors, famRows, memRows, benRows] = await Promise.all([
    query("SELECT id, full_name, cin, phone, type, parent_id FROM sponsors ORDER BY full_name"),
    query("SELECT sponsor_id, COUNT(*) AS c FROM families WHERE sponsor_id IS NOT NULL GROUP BY sponsor_id"),
    query("SELECT f.sponsor_id, COUNT(*) AS c FROM family_members m JOIN families f ON f.id = m.family_id WHERE f.sponsor_id IS NOT NULL GROUP BY f.sponsor_id"),
    query("SELECT f.sponsor_id, COUNT(*) AS c FROM families f WHERE f.sponsor_id IS NOT NULL AND EXISTS (SELECT 1 FROM distribution_assignments a WHERE a.family_id = f.id) GROUP BY f.sponsor_id")
  ]);
  const own = (rows) => new Map(rows.map((r) => [r.sponsor_id, Number(r.c)]));
  const fam = own(famRows);
  const mem = own(memRows);
  const ben = own(benRows);
  return sponsors.map((s) => ({
    id: s.id,
    name: s.full_name,
    fullName: s.full_name,
    cin: s.cin,
    phone: s.phone,
    type: s.type,
    parentId: s.parent_id || null,
    canHaveFamilies: canHaveFamilies(s.type),
    canHaveChildren: canHaveChildren(s.type),
    ownFamilies: fam.get(s.id) || 0,
    ownMembers: mem.get(s.id) || 0,
    ownBenefited: ben.get(s.id) || 0
  }));
}

function buildTree(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, { ...n, children: [], ancestors: [] }]));
  const roots = [];
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : null;
    if (parent) {
      parent.children.push(n);
      n.parentName = parent.name;
      n.parentType = parent.type;
    } else {
      n.parentName = null;
      n.parentType = null;
      roots.push(n);
    }
  }
  const walk = (n, ancestors) => {
    n.ancestors = ancestors;
    let families = n.ownFamilies;
    let members = n.ownMembers;
    let benefited = n.ownBenefited;
    let descendants = 0;
    for (const c of n.children) {
      walk(c, [...ancestors, { id: n.id, name: n.name, type: n.type }]);
      families += c.families;
      members += c.members;
      benefited += c.benefited;
      descendants += 1 + c.descendantCount;
    }
    n.subCount = n.children.length;
    n.descendantCount = descendants;
    n.families = families;
    n.members = members;
    n.benefited = benefited;
    n.waiting = families - benefited;
    n.coverageRate = pct(benefited, families);
  };
  roots.forEach((r) => walk(r, []));
  return { roots, byId };
}

function flatten(roots) {
  const out = [];
  const visit = (n) => {
    out.push(n);
    n.children.forEach(visit);
  };
  roots.forEach(visit);
  return out;
}

async function sponsorTree({ sponsorId = null } = {}) {
  const { roots, byId } = buildTree(await loadSponsorNodes());
  let top = roots;
  if (sponsorId) {
    const node = byId.get(Number(sponsorId));
    top = node ? [node] : [];
  }
  return { tree: top, flat: flatten(top), byId };
}

module.exports = { loadSponsorNodes, buildTree, flatten, sponsorTree, pct };
