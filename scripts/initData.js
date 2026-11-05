const { loadEnv } = require("../lib/loadEnv");
loadEnv();
const crypto = require("crypto");
const { query, closePool } = require("../lib/db");
const { createSponsor, createVendor } = require("../lib/entities");
const { createFamily } = require("../lib/families");
const { createUser } = require("../lib/users");
const { createDistribution } = require("../lib/distributions");

const FIRST_LATIN = ["Mohamed", "Ahmed", "Fatima", "Khadija", "Youssef", "Hassan", "Aicha", "Omar", "Zineb", "Karim", "Najat", "Said", "Loubna", "Rachid", "Samira", "Abdelilah", "Hanane", "Mustapha", "Latifa", "Ibrahim", "Meryem", "Abdelkader", "Salma", "Driss", "Naima", "Hamza", "Soukaina", "Brahim", "Amina", "Nabil", "Houda", "Tarik", "Wafaa", "Jamal", "Rajae"];
const LAST_LATIN = ["Alaoui", "Bouknitir", "Benali", "El Idrissi", "Tazi", "Fassi", "Berrada", "Lahlou", "Chraibi", "Amrani", "Bennani", "Ouazzani", "Haddad", "Mansouri", "Saidi", "Zerouali", "Kettani", "Benjelloun", "Rifi", "Cherkaoui", "Sebti", "Naciri", "Lamrani", "Slaoui"];
const FIRST_ARABIC = ["محمد", "أحمد", "فاطمة", "خديجة", "يوسف", "حسن", "عائشة", "عمر", "زينب", "كريم", "سعيد", "لبنى"];
const LAST_ARABIC = ["العلوي", "بوقنيطير", "بنعلي", "الإدريسي", "الطازي", "الفاسي", "برادة", "لحلو", "الشرايبي", "العمراني"];
const VENDOR_NAMES = ["Épicerie Al Baraka", "Supermarché Annajah", "Boucherie Atlas", "Alimentation Salam", "Marché Al Amal", "Épicerie Chourouk", "Grossiste Oulad Ali", "Supérette Nour", "Boulangerie Al Wifaq", "Alimentation Ghazi"];
const USER_NAMES = ["Samira Tahiri", "Youssef Lazrak", "Hanane Idrissi", "Omar Bakkali", "Khadija Ennaji", "Rachid Zniber", "Meryem Ouali", "Karim Haddou", "Salma Rhazi", "Driss Mouhib"];

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function randomName() {
  if (crypto.randomInt(100) < 25) return `${pick(FIRST_ARABIC)} ${pick(LAST_ARABIC)}`;
  return `${pick(FIRST_LATIN)} ${pick(LAST_LATIN)}`;
}

function digits(n) {
  let out = "";
  for (let i = 0; i < n; i++) out += String(crypto.randomInt(10));
  return out;
}

function uniqueGenerator(make) {
  const used = new Set();
  return () => {
    for (let i = 0; i < 1000; i++) {
      const value = make();
      if (!used.has(value)) {
        used.add(value);
        return value;
      }
    }
    throw new Error("Impossible de générer une valeur unique.");
  };
}

const nextCin = uniqueGenerator(() => `${pick(["A", "B", "BE", "BK", "C", "D", "EE", "F", "G", "H", "J", "K", "L", "M", "T", "Z"])}${digits(6)}`);
const nextPhone = uniqueGenerator(() => `0${pick(["6", "7"])}${digits(8)}`);

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function main() {
  const existing = await query("SELECT (SELECT COUNT(*) FROM families) AS families, (SELECT COUNT(*) FROM sponsors) AS sponsors, (SELECT COUNT(*) FROM vendors) AS vendors");
  const force = process.argv.includes("--force") || process.env.DATA_FORCE === "true";
  if ((existing[0].families > 0 || existing[0].sponsors > 0 || existing[0].vendors > 0) && !force) {
    throw new Error("La base contient déjà des familles, parrains ou vendeurs. Relancez avec --force pour ajouter quand même les données de démonstration.");
  }
  const password = process.env.DATA_USER_PASSWORD || `Demo${crypto.randomBytes(4).toString("hex")}9`;

  const sponsorIds = [];
  const groupIds = [];
  const specialIds = [];
  const usedSponsorNames = new Set();
  const freshName = () => {
    let name = randomName();
    while (usedSponsorNames.has(name)) name = randomName();
    usedSponsorNames.add(name);
    return name;
  };
  const mkSponsor = async (fullName, type, parentId) => createSponsor({ fullName, cin: nextCin(), phone: nextPhone(), type, parentId: parentId || null }, null, { force: true });
  const mkFamilySponsor = async (type, parentId) => {
    const id = await mkSponsor(freshName(), type, parentId);
    sponsorIds.push(id);
    return id;
  };
  const labelled = async (label, type, parentId) => {
    usedSponsorNames.add(label);
    return mkSponsor(label, type, parentId);
  };
  const alAmal = await labelled("Association Al Amal", "group");
  const nour = await labelled("Fondation Nour", "group");
  groupIds.push(alAmal, nour);
  for (let i = 0; i < 2; i++) await mkFamilySponsor("classic", alAmal);
  const rahma = await labelled("Collectif Rahma", "special", alAmal);
  specialIds.push(rahma);
  for (let i = 0; i < 2; i++) await mkFamilySponsor("sub", rahma);
  for (let i = 0; i < 3; i++) await mkFamilySponsor("classic", nour);
  const entraide = await labelled("Réseau Entraide", "special");
  specialIds.push(entraide);
  for (let i = 0; i < 2; i++) await mkFamilySponsor("sub", entraide);
  while (sponsorIds.length < 18) await mkFamilySponsor("classic");

  const vendorIds = [];
  for (const name of VENDOR_NAMES) vendorIds.push(await createVendor({ name, phone: nextPhone() }, null, { force: true }));

  const users = [];
  for (const username of USER_NAMES) {
    await createUser({ username, password, role: "user" }, null);
    users.push(username);
  }

  const familyIds = [];
  for (let i = 0; i < 50; i++) {
    const repPhone = nextPhone();
    const familyName = pick(LAST_LATIN);
    const memberCount = crypto.randomInt(0, 6);
    const members = [];
    for (let m = 0; m < memberCount; m++) {
      const adult = crypto.randomInt(100) < 35;
      members.push({
        fullName: `${pick(FIRST_LATIN)} ${familyName}`,
        cin: adult ? nextCin() : null,
        phone: crypto.randomInt(100) < 80 ? repPhone : nextPhone()
      });
    }
    const id = await createFamily(
      {
        representative: { fullName: crypto.randomInt(100) < 25 ? randomName() : `${pick(FIRST_LATIN)} ${familyName}`, cin: nextCin(), phone: repPhone },
        sponsorId: pick(sponsorIds),
        members
      },
      null
    );
    familyIds.push(id);
  }

  const registrations = familyIds.map((id, index) => [id, 40 - Math.floor((index / familyIds.length) * 38)]);
  for (const [id, days] of registrations) {
    await query("UPDATE families SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) WHERE id = ?", [days, id]);
  }

  const plan = [
    [21, 8],
    [14, 6],
    [10, 5],
    [7, 6],
    [3, 5]
  ];
  let cursor = 0;
  let distributions = 0;
  for (const [daysAgo, count] of plan) {
    const slice = familyIds.slice(cursor, cursor + count);
    cursor += count;
    const vendorsToday = vendorIds.slice(0, 3 + crypto.randomInt(0, 4));
    const assignments = slice.map((familyId, i) => ({ familyId, vendorId: vendorsToday[i % vendorsToday.length] }));
    const date = isoDaysAgo(daysAgo);
    const id = await createDistribution({ date, assignments }, null);
    await query("UPDATE distributions SET created_at = ? WHERE id = ?", [`${date} 10:00:00`, id]);
    await query("UPDATE distribution_assignments SET assigned_at = ? WHERE distribution_id = ?", [`${date} 10:00:00`, id]);
    distributions += 1;
  }

  console.log("Données de démonstration insérées :");
  console.log(`  - ${groupIds.length} super-parrains, ${specialIds.length} parrains spéciaux (4 sous-parrains) et ${sponsorIds.length - 4} parrains classiques`);
  console.log(`  - ${vendorIds.length} vendeurs`);
  console.log(`  - ${users.length} utilisateurs (rôle utilisateur)`);
  console.log(`  - ${familyIds.length} familles dont ${cursor} déjà bénéficiaires (${distributions} distributions passées)`);
  console.log(`  - ${familyIds.length - cursor} familles en attente de leur premier panier`);
  console.log("");
  console.log(`Mot de passe des utilisateurs de démonstration : ${password}`);
  console.log("Identifiants :");
  users.forEach((u) => console.log(`  ${u}`));
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    console.error("Échec :", error.message);
    await closePool();
    process.exit(1);
  });
