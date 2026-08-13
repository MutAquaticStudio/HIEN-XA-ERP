import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type Tone = "primary" | "secondary" | "danger";

export function AppShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hx-shell ${className}`.trim()}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="hx-page-header"><div>{eyebrow ? <p className="hx-eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="hx-page-actions">{actions}</div> : null}</header>;
}

export function Button({ tone = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button className={`hx-button hx-button-${tone} ${className}`.trim()} {...props} />;
}

export function Field({ label, hint, error, inputProps }: { label: string; hint?: string; error?: string; inputProps?: InputHTMLAttributes<HTMLInputElement> }) {
  const message = error ?? hint;
  return <label className="hx-field"><span>{label}</span><input aria-invalid={Boolean(error)} {...inputProps} />{message ? <small className={error ? "hx-field-error" : undefined}>{message}</small> : null}</label>;
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className="hx-field"><span>{label}</span><select {...props}>{children}</select></label>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <span className={`hx-status hx-status-${tone}`}>{children}</span>;
}

export function Panel({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`hx-panel ${className}`.trim()} {...props}>{children}</section>;
}

export function DataTable({ headers, rows, className = "" }: { headers: string[]; rows: ReactNode[][]; className?: string }) {
  return <div className={`hx-data-table ${className}`.trim()}><div className="hx-data-table-scroll"><table><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div><div className="hx-data-cards">{rows.map((row, rowIndex) => <article className="hx-data-card" key={rowIndex}>{row.map((cell, cellIndex) => <div key={cellIndex}><span>{headers[cellIndex] ?? `Thông tin ${cellIndex + 1}`}</span><div>{cell}</div></div>)}</article>)}</div></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="hx-empty"><span aria-hidden="true" className="hx-empty-mark" /><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function InlineAlert({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "warning" | "danger" }) {
  return <div className={`hx-alert hx-alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>{children}</div>;
}

export function ActionReview({ title = "Rà soát trước khi xác nhận", children, actions }: { title?: string; children: ReactNode; actions: ReactNode }) {
  return <section className="hx-review"><h2>{title}</h2><div>{children}</div><footer>{actions}</footer></section>;
}
