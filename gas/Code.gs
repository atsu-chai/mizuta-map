const SHEET_NAME = 'puddles';
const DRIVE_FOLDER_ID = '';

function doGet() {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift() || [];
  const puddles = rows
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index];
      });
      return item;
    });

  return json_({ puddles });
}

function doPost(event) {
  const payload = JSON.parse(event.postData.contents);
  const sheet = getSheet_();
  const imageUrl = payload.image ? saveImage_(payload.image) : '';
  const id = Utilities.getUuid();

  sheet.appendRow([
    id,
    Number(payload.latitude),
    Number(payload.longitude),
    payload.size,
    payload.review || '',
    payload.checkedAt,
    payload.weather || '未取得',
    imageUrl,
  ]);

  return json_({ ok: true, id, imageUrl });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'id',
      'latitude',
      'longitude',
      'size',
      'review',
      'checkedAt',
      'weather',
      'imageUrl',
    ]);
  }

  return sheet;
}

function saveImage_(image) {
  const bytes = Utilities.base64Decode(image.base64);
  const blob = Utilities.newBlob(bytes, image.mimeType, image.fileName);
  const folder = DRIVE_FOLDER_ID
    ? DriveApp.getFolderById(DRIVE_FOLDER_ID)
    : DriveApp.getRootFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
