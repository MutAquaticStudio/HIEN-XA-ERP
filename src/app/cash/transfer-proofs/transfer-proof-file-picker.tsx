"use client";

import { useState } from "react";
import styles from "./transfer-proofs.module.css";

export function TransferProofFilePicker() {
  const [fileNames, setFileNames] = useState<string[]>([]);

  return (
    <div className={`${styles.field} ${styles.fileField}`}>
      <span>Tệp chứng từ <b>*</b></span>
      <label className={styles.filePicker}>
        <span className={styles.filePickerButton}>Chọn tệp chứng từ</span>
        <span className={styles.filePickerText}>JPG, PNG, WEBP hoặc PDF. Tối đa 3 tệp, mỗi tệp 8 MB.</span>
        <input
          className={styles.fileInput}
          name="document"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          required
          onChange={(event) => setFileNames(Array.from(event.currentTarget.files ?? []).map((file) => file.name))}
        />
      </label>
      <div className={styles.fileStatus} aria-live="polite">
        {fileNames.length === 0 ? "Chưa chọn tệp nào." : `${fileNames.length} tệp đã chọn:`}
        {fileNames.length > 0 ? <ul>{fileNames.map((fileName) => <li key={fileName}>{fileName}</li>)}</ul> : null}
      </div>
    </div>
  );
}
