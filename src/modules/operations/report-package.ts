import {
  serializeMonthlyReportCsv,
  serializeMonthlyReportDashboardHtml,
  type MonthlyReport
} from "./monthly-report";

export type MonthlyReportPackageFile = {
  fileName: string;
  mediaType: string;
  content: string;
};

export type StoredZipFile = {
  fileName: string;
  content: string;
};

export type MonthlyReportExportPackage = {
  fileName: string;
  mediaType: "application/zip";
  bytes: Uint8Array;
  files: MonthlyReportPackageFile[];
};

const zipUtf8Flag = 0x0800;
const zipStoredMethod = 0;

export function createMonthlyReportExportPackage(report: MonthlyReport): MonthlyReportExportPackage {
  const csvFileName = `bao-cao-thang-${report.month}.csv`;
  const dashboardFileName = `dashboard-thang-${report.month}.html`;
  const manifestFileName = "manifest.json";

  const files: MonthlyReportPackageFile[] = [
    {
      fileName: csvFileName,
      mediaType: "text/csv;charset=utf-8",
      content: serializeMonthlyReportCsv(report)
    },
    {
      fileName: dashboardFileName,
      mediaType: "text/html;charset=utf-8",
      content: serializeMonthlyReportDashboardHtml(report)
    },
    {
      fileName: manifestFileName,
      mediaType: "application/json;charset=utf-8",
      content: JSON.stringify(
        {
          kind: "vlxd.monthly_report_package",
          month: report.month,
          monthLabel: report.monthLabel,
          generatedAt: report.generatedAt,
          attachments: [
            { fileName: csvFileName, mediaType: "text/csv;charset=utf-8", role: "ledger_report" },
            { fileName: dashboardFileName, mediaType: "text/html;charset=utf-8", role: "dashboard_attachment" }
          ],
          summary: report.summary
        },
        null,
        2
      )
    }
  ];

  return {
    fileName: `bao-cao-thang-${report.month}.zip`,
    mediaType: "application/zip",
    bytes: buildStoredZip(files),
    files
  };
}

export function buildStoredZip(files: StoredZipFile[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.fileName);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);
    const localHeader = createLocalFileHeader(nameBytes, contentBytes.length, crc);
    const centralHeader = createCentralDirectoryHeader(nameBytes, contentBytes.length, crc, offset);

    localParts.push(localHeader, nameBytes, contentBytes);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endOfCentralDirectory = createEndOfCentralDirectory(files.length, centralDirectorySize, centralDirectoryOffset);

  return concatUint8Arrays([...localParts, ...centralParts, endOfCentralDirectory]);
}

function createLocalFileHeader(nameBytes: Uint8Array, size: number, crc: number) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, zipUtf8Flag, true);
  view.setUint16(8, zipStoredMethod, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);

  return header;
}

function createCentralDirectoryHeader(nameBytes: Uint8Array, size: number, crc: number, localHeaderOffset: number) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, zipUtf8Flag, true);
  view.setUint16(10, zipStoredMethod, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);

  return header;
}

function createEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

const crcTable = createCrcTable();

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
