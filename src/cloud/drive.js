// cloud/drive.js
const { google } = require("googleapis");
const { getAuthorizedClient } = require("./googleAuth");

function driveFrom(client) {
  return google.drive({ version: "v3", auth: client });
}

// crée/maj un fichier JSON dans un dossier "Bento Budget" du Drive
async function saveJsonToDrive(filename, jsonString) {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Non connecté à Google (signIn d’abord).");
  const drive = driveFrom(client);

  // 1) s'assurer que le dossier existe
  const folderName = "Bento Budget";
  const search = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  let folderId = search.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name: folderName, mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    folderId = created.data.id;
  }

  // 2) créer ou mettre à jour le fichier
  const files = await drive.files.list({
    q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id,name)",
  });
  const fileId = files.data.files?.[0]?.id;

  const media = { mimeType: "application/json", body: Buffer.from(jsonString, "utf8") };

  if (fileId) {
    await drive.files.update({ fileId, media, fields: "id" });
  } else {
    await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media,
      fields: "id",
    });
  }
}

// lit le contenu JSON (string) du Drive, sinon null si absent
async function loadJsonFromDrive(filename) {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Non connecté à Google (signIn d’abord).");
  const drive = driveFrom(client);

  const files = await drive.files.list({
    q: `name='${filename}' and trashed=false`,
    fields: "files(id,name)",
  });
  const fileId = files.data.files?.[0]?.id;
  if (!fileId) return null;

  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data).toString("utf8");
}

module.exports = { saveJsonToDrive, loadJsonFromDrive };