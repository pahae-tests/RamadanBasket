const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function missingConfig() {
  const required = ["BACKUP_STORAGE_BUCKET", "BACKUP_STORAGE_ACCESS_KEY_ID", "BACKUP_STORAGE_SECRET_ACCESS_KEY"];
  return required.filter((name) => !process.env[name]);
}

function isConfigured() {
  return missingConfig().length === 0;
}

function getClient() {
  if (!global.__rbmS3) {
    const config = {
      region: process.env.BACKUP_STORAGE_REGION || "auto",
      credentials: {
        accessKeyId: process.env.BACKUP_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.BACKUP_STORAGE_SECRET_ACCESS_KEY
      },
      forcePathStyle: String(process.env.BACKUP_STORAGE_FORCE_PATH_STYLE || "true").toLowerCase() !== "false"
    };
    if (process.env.BACKUP_STORAGE_ENDPOINT) config.endpoint = process.env.BACKUP_STORAGE_ENDPOINT;
    global.__rbmS3 = new S3Client(config);
  }
  return global.__rbmS3;
}

function bucket() {
  return process.env.BACKUP_STORAGE_BUCKET;
}

async function putBuffer(key, body, contentType) {
  await getClient().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

async function putStream(key, stream, contentType) {
  const upload = new Upload({
    client: getClient(),
    params: { Bucket: bucket(), Key: key, Body: stream, ContentType: contentType },
    queueSize: 2,
    partSize: 5 * 1024 * 1024
  });
  await upload.done();
}

async function headSize(key) {
  const result = await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  return Number(result.ContentLength);
}

async function signedDownloadUrl(key, filename) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: `attachment; filename="${filename}"` }),
    { expiresIn: 60 }
  );
}

async function remove(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

module.exports = { isConfigured, missingConfig, putBuffer, putStream, headSize, signedDownloadUrl, remove };
