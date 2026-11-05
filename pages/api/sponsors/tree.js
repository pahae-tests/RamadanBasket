const { route } = require("../../../lib/http");
const { sponsorTree } = require("../../../lib/sponsorTree");

function shape(n) {
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    cin: n.cin,
    phone: n.phone,
    canHaveFamilies: n.canHaveFamilies,
    parentId: n.parentId,
    parentName: n.parentName,
    subCount: n.subCount,
    ownFamilies: n.ownFamilies,
    families: n.families,
    members: n.members,
    benefited: n.benefited,
    waiting: n.waiting,
    coverageRate: n.coverageRate,
    children: n.children.map(shape)
  };
}

async function tree(req, res) {
  const { tree: roots } = await sponsorTree();
  res.status(200).json({ tree: roots.map(shape) });
}

export default route({ GET: tree });
