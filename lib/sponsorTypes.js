const TYPES = ["group", "classic", "special", "sub"];

const TYPE_LABELS = {
  group: "Super-parrain",
  classic: "Parrain classique",
  special: "Parrain spécial",
  sub: "Sous-parrain"
};

const TYPE_PLURALS = {
  group: "super-parrains",
  classic: "parrains classiques",
  special: "parrains spéciaux",
  sub: "sous-parrains"
};

const TYPE_HELP = {
  group: "Gère plusieurs parrains classiques ou spéciaux. N'a jamais de familles directement.",
  classic: "Gère directement plusieurs familles. N'a pas de sous-parrains.",
  special: "Gère plusieurs sous-parrains. N'a jamais de familles directement.",
  sub: "Rattaché à un parrain spécial. Gère directement ses propres familles."
};

const CHILD_TYPES = {
  group: ["classic", "special"],
  classic: [],
  special: ["sub"],
  sub: []
};

const PARENT_TYPES = {
  group: [],
  classic: ["group"],
  special: ["group"],
  sub: ["special"]
};

module.exports = { TYPES, TYPE_LABELS, TYPE_PLURALS, TYPE_HELP, CHILD_TYPES, PARENT_TYPES };
