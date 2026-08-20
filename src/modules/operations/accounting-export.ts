import { createReportForDateRange, type MonthlyReportSection } from "./monthly-report";
import { buildStoredZip } from "./report-package";
import type { OperationsState } from "./types";

type CellValue = string | number;

export const accountingExportDatasets = [
  { id: "summary", label: "Tổng hợp", sectionTitle: "Tổng hợp", sheetName: "Tổng hợp" },
  { id: "sales", label: "Đơn bán", sectionTitle: "Đơn bán lập trong tháng", sheetName: "Đơn bán" },
  { id: "receivables", label: "Công nợ khách", sectionTitle: "Sổ công nợ khách hàng", sheetName: "Công nợ khách" },
  { id: "payables", label: "Công nợ nhà cung cấp", sectionTitle: "Sổ công nợ nhà cung cấp", sheetName: "Công nợ NCC" },
  { id: "cash", label: "Sổ quỹ", sectionTitle: "Sổ quỹ", sheetName: "Sổ quỹ" },
  { id: "inventory", label: "Phát sinh kho", sectionTitle: "Phát sinh kho", sheetName: "Phát sinh kho" },
  { id: "workforce", label: "Sổ tiền công", sectionTitle: "Sổ tiền công nhân viên", sheetName: "Sổ tiền công" }
] as const;

export type AccountingExportDatasetId = (typeof accountingExportDatasets)[number]["id"];

export type AccountingXlsxExport = {
  fileName: string;
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  bytes: Uint8Array;
  reportPeriod: { fromDate: string; toDate: string };
  sheetNames: string[];
};

export function createAccountingXlsxExport(
  state: OperationsState,
  options: { fromDate: string; toDate: string; datasetIds: AccountingExportDatasetId[]; generatedAt?: string }
): AccountingXlsxExport {
  const selectedIds = Array.from(new Set(options.datasetIds));
  if (selectedIds.length === 0) {
    throw new Error("Chọn ít nhất một bộ dữ liệu để xuất.");
  }

  const report = createReportForDateRange(state, { fromDate: options.fromDate, toDate: options.toDate }, options.generatedAt);
  const selectedDatasets = accountingExportDatasets.filter((dataset) => selectedIds.includes(dataset.id));
  const sheets = selectedDatasets.map((dataset) => {
    const section = report.sections.find((item) => item.title === dataset.sectionTitle);
    if (!section) throw new Error(`Không tìm thấy bộ dữ liệu ${dataset.label}.`);
    return { name: dataset.sheetName, section };
  });

  return {
    fileName: `du-lieu-ke-toan-${options.fromDate}-den-${options.toDate}.xlsx`,
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: buildWorkbook(sheets, report.generatedAt, options.fromDate, options.toDate),
    reportPeriod: { fromDate: options.fromDate, toDate: options.toDate },
    sheetNames: sheets.map((sheet) => sheet.name)
  };
}

function buildWorkbook(
  sheets: Array<{ name: string; section: MonthlyReportSection }>,
  generatedAt: string,
  fromDate: string,
  toDate: string
) {
  const files = [
    { fileName: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
    { fileName: "_rels/.rels", content: rootRelationshipsXml() },
    { fileName: "xl/workbook.xml", content: workbookXml(sheets) },
    { fileName: "xl/_rels/workbook.xml.rels", content: workbookRelationshipsXml(sheets.length) },
    ...sheets.map((sheet, index) => ({
      fileName: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet.name, sheet.section, generatedAt, fromDate, toDate)
    }))
  ];
  return buildStoredZip(files);
}

function contentTypesXml(sheetCount: number) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}</Types>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(sheets: Array<{ name: string }>) {
  const items = sheets.map((sheet, index) => `<sheet name="${escapeXmlAttribute(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${items}</sheets></workbook>`;
}

function workbookRelationshipsXml(sheetCount: number) {
  const relationships = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
}

function worksheetXml(sheetName: string, section: MonthlyReportSection, generatedAt: string, fromDate: string, toDate: string) {
  const rows: CellValue[][] = [
    [`Xuất dữ liệu kế toán · ${sheetName}`],
    ["Từ ngày", fromDate],
    ["Đến ngày", toDate],
    ["Thời điểm xuất", generatedAt],
    [],
    section.headers,
    ...section.rows
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => worksheetRowXml(row, rowIndex + 1)).join("")}</sheetData></worksheet>`;
}

function worksheetRowXml(row: CellValue[], rowNumber: number) {
  const cells = row.map((value, index) => worksheetCellXml(value, `${columnName(index + 1)}${rowNumber}`)).join("");
  return `<row r="${rowNumber}">${cells}</row>`;
}

function worksheetCellXml(value: CellValue, reference: string) {
  if (typeof value === "number") {
    return `<c r="${reference}" t="n"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  }
  const text = escapeXmlText(value);
  const preserve = value.trim() !== value ? " xml:space=\"preserve\"" : "";
  return `<c r="${reference}" t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
}

function columnName(column: number) {
  let result = "";
  let current = column;
  while (current > 0) {
    const offset = (current - 1) % 26;
    result = String.fromCharCode(65 + offset) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function escapeXmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string) {
  return escapeXmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
