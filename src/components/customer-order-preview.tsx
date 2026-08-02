"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createCustomerPortalOrderAction } from "@/app/portal-actions";
import styles from "@/app/dat-hang/page.module.css";

type CustomerCatalogItem = {
  id: string;
  code: string;
  name: string;
  unitName: string;
  salePrice: number;
  taxRate: number;
  availableQuantity: number;
};

type CustomerOrderPreviewProps = {
  products: CustomerCatalogItem[];
  canPlaceOrder: boolean;
};

type WizardStep = 1 | 2 | 3;
const cartStorageKey = "hien-xa-customer-cart-v2";

export function CustomerOrderPreview({ products, canPlaceOrder }: CustomerOrderPreviewProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "credit_requested">("transfer");
  const [customerNote, setCustomerNote] = useState("");
  const [message, setMessage] = useState<string>();
  const [hydrated, setHydrated] = useState(false);
  const [pending, startTransition] = useTransition();
  const submissionKey = useRef(createSubmissionKey());

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(cartStorageKey) ?? "{}") as Record<string, unknown>;
      const validIds = new Set(products.map((product) => product.id));
      const restored = Object.fromEntries(Object.entries(saved)
        .filter(([id, value]) => validIds.has(id) && typeof value === "number" && value > 0)
        .map(([id, value]) => [id, Math.floor(value as number)]));
      setQuantities(restored);
    } catch {
      window.localStorage.removeItem(cartStorageKey);
    } finally {
      setHydrated(true);
    }
  }, [products]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(cartStorageKey, JSON.stringify(quantities));
  }, [hydrated, quantities]);

  const selectedItems = useMemo(() => products
    .filter((product) => (quantities[product.id] ?? 0) > 0)
    .map((product) => ({ ...product, quantity: quantities[product.id] ?? 0 })), [products, quantities]);
  const netTotal = selectedItems.reduce((total, item) => total + item.quantity * item.salePrice, 0);
  const taxTotal = selectedItems.reduce((total, item) => total + item.quantity * item.salePrice * item.taxRate, 0);
  const grossTotal = netTotal + taxTotal;

  function updateQuantity(product: CustomerCatalogItem, nextValue: number) {
    const safeValue = Number.isFinite(nextValue)
      ? Math.max(0, Math.min(Math.floor(nextValue), Math.floor(product.availableQuantity)))
      : 0;
    setQuantities((current) => ({ ...current, [product.id]: safeValue }));
    setMessage(undefined);
  }

  function goToDelivery() {
    if (selectedItems.length === 0) {
      setMessage("Cô/chú hãy chọn ít nhất một vật liệu.");
      return;
    }
    setMessage(undefined);
    setStep(2);
  }

  function goToReview() {
    if (deliveryAddress.trim().length < 8) {
      setMessage("Vui lòng ghi địa chỉ giao hàng rõ ràng, ít nhất 8 ký tự.");
      return;
    }
    setMessage(undefined);
    setStep(3);
  }

  function submitOrder() {
    if (!canPlaceOrder) {
      window.location.assign("/khach-hang/dang-nhap?returnTo=%2Fdat-hang");
      return;
    }
    startTransition(async () => {
      const result = await createCustomerPortalOrderAction({
        idempotencyKey: submissionKey.current,
        deliveryAddress: deliveryAddress.trim(),
        customerNote: customerNote.trim() || undefined,
        paymentMethod,
        lines: selectedItems.map((item) => ({ productUnitId: item.id, quantity: item.quantity }))
      });
      setMessage(result.message);
      if (result.ok) {
        setQuantities({});
        setDeliveryAddress("");
        setCustomerNote("");
        setPaymentMethod("transfer");
        setStep(1);
        submissionKey.current = createSubmissionKey();
        window.localStorage.removeItem(cartStorageKey);
      }
    });
  }

  return (
    <div className={styles.customerShell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/dat-hang" aria-label="VLXD Hiền Xạ - đặt vật liệu">
          <span className={styles.brandMark}>HX</span>
          <span><strong>VLXD Hiền Xạ</strong><small>Đặt vật liệu trực tuyến</small></span>
        </a>
        <a className={styles.loginLink} href={canPlaceOrder ? "/khach-hang" : "/khach-hang/dang-nhap"}>
          {canPlaceOrder ? "Mở tài khoản của tôi" : "Đăng nhập khách hàng"}
        </a>
      </header>

      <section className={styles.intro}>
        <p className={styles.kicker}>Đặt hàng rõ ràng, từng bước</p>
        <h1>Chọn đúng vật liệu, xem đủ chi phí trước khi gửi.</h1>
        <p>Giá trên màn hình là dự kiến. Cửa hàng luôn kiểm tra lại giá, hàng sẵn và lịch giao trước khi xác nhận đơn.</p>
      </section>

      <ol className={styles.stepper} aria-label="Tiến trình đặt hàng">
        {([[1, "Chọn hàng"], [2, "Giao và thanh toán"], [3, "Rà soát"]] as const).map(([number, label]) => (
          <li className={number === step ? styles.activeStep : number < step ? styles.completeStep : ""} key={number} aria-current={number === step ? "step" : undefined}>
            <span>{number < step ? "✓" : number}</span><strong>{label}</strong>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className={styles.stepPanel} aria-labelledby="catalog-title">
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>Bước 1</p><h2 id="catalog-title">Chọn vật liệu và số lượng</h2></div>
            <span className={styles.catalogCount}>{products.length} vật tư</span>
          </div>
          {products.length === 0 ? <div className={styles.emptyState}>Chưa có vật liệu công khai giá. Vui lòng liên hệ cửa hàng để được báo giá.</div> : (
            <div className={styles.productGrid}>
              {products.map((product) => {
                const quantity = quantities[product.id] ?? 0;
                const isAvailable = product.availableQuantity > 0;
                return (
                  <article className={[styles.productCard, quantity > 0 ? styles.selectedProduct : ""].filter(Boolean).join(" ")} key={product.id}>
                    <div className={styles.productMeta}><span>{product.code}</span><span className={isAvailable ? styles.available : styles.unavailable}>{isAvailable ? "Có thể đặt" : "Cần hỏi cửa hàng"}</span></div>
                    <h3>{product.name}</h3>
                    <p className={styles.price}>{formatMoney(product.salePrice)}<small> / {product.unitName}</small></p>
                    <p className={styles.tax}>Giá đã gồm VAT {formatPercent(product.taxRate)}. Hàng sẵn tham khảo: {formatQuantity(product.availableQuantity)} {product.unitName}.</p>
                    <div className={styles.quantityControl}>
                      <button type="button" onClick={() => updateQuantity(product, quantity - 1)} disabled={quantity <= 0} aria-label={"Giảm số lượng " + product.name}>-</button>
                      <label><span>Số lượng ({product.unitName})</span><input type="number" min="0" max={Math.max(0, Math.floor(product.availableQuantity))} value={quantity || ""} disabled={!isAvailable} onChange={(event) => updateQuantity(product, Number(event.target.value))} /></label>
                      <button type="button" onClick={() => updateQuantity(product, quantity + 1)} disabled={!isAvailable || quantity >= product.availableQuantity} aria-label={"Tăng số lượng " + product.name}>+</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <CartBar count={selectedItems.length} total={grossTotal} label="Tiếp tục nhập thông tin giao" onNext={goToDelivery} />
        </section>
      ) : null}

      {step === 2 ? (
        <section className={styles.stepPanel} aria-labelledby="delivery-title">
          <div className={styles.sectionHeading}><div><p className={styles.kicker}>Bước 2</p><h2 id="delivery-title">Thông tin giao và thanh toán</h2></div></div>
          <div className={styles.formGrid}>
            <label className={styles.fullField}><span>Địa chỉ giao hàng</span><textarea autoFocus required rows={4} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Ghi rõ số nhà, đường hoặc tên công trình" /></label>
            <label><span>Cách thanh toán</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="transfer">Chuyển khoản và gửi ảnh minh chứng</option><option value="credit_requested">Đề nghị mua công nợ</option></select></label>
            <label><span>Ghi chú cho cửa hàng (không bắt buộc)</span><textarea rows={3} maxLength={1000} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Ví dụ: cần giao buổi sáng" /></label>
          </div>
          <div className={styles.guidance}><strong>Cửa hàng sẽ kiểm tra trước khi xác nhận</strong><p>Đề nghị mua công nợ chỉ được duyệt khi hồ sơ còn hoạt động và hạn mức còn đủ.</p></div>
          <div className={styles.navigation}><button className={styles.secondaryButton} type="button" onClick={() => setStep(1)}>Quay lại chọn hàng</button><button className={styles.primaryButton} type="button" onClick={goToReview}>Tiếp tục rà soát</button></div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={styles.stepPanel} aria-labelledby="review-title">
          <div className={styles.sectionHeading}><div><p className={styles.kicker}>Bước 3</p><h2 id="review-title">Rà soát trước khi gửi</h2></div></div>
          <div className={styles.reviewLayout}>
            <div><h3>Vật liệu đã chọn</h3><ul className={styles.quoteLines}>{selectedItems.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{formatQuantity(item.quantity)} {item.unitName} x {formatMoney(item.salePrice)}</small></span><b>{formatMoney(item.quantity * item.salePrice * (1 + item.taxRate))}</b></li>)}</ul></div>
            <aside className={styles.reviewSummary}>
              <h3>Thông tin đơn dự kiến</h3>
              <dl><div><dt>Giao đến</dt><dd>{deliveryAddress}</dd></div><div><dt>Thanh toán</dt><dd>{paymentMethod === "transfer" ? "Chuyển khoản" : "Đề nghị công nợ"}</dd></div><div><dt>Tạm tính</dt><dd>{formatMoney(netTotal)}</dd></div><div><dt>VAT dự kiến</dt><dd>{formatMoney(taxTotal)}</dd></div><div className={styles.grandTotal}><dt>Tổng dự kiến</dt><dd>{formatMoney(grossTotal)}</dd></div></dl>
              <p>Hệ thống sẽ tính lại giá và VAT khi gửi. Đơn chỉ có hiệu lực sau khi cửa hàng xác nhận.</p>
            </aside>
          </div>
          <div className={styles.navigation}><button className={styles.secondaryButton} type="button" onClick={() => setStep(2)}>Quay lại chỉnh thông tin</button><button className={styles.primaryButton} type="button" disabled={pending} onClick={submitOrder}>{pending ? "Đang gửi đơn..." : canPlaceOrder ? "Xác nhận gửi đơn" : "Đăng nhập để gửi đơn"}</button></div>
        </section>
      ) : null}

      {message ? <p className={styles.previewNotice} role="status" aria-live="polite">{message}</p> : null}
      <footer className={styles.footer}>VLXD Hiền Xạ xác nhận lại giá, số lượng và thời gian giao trước khi thực hiện.</footer>
    </div>
  );
}

function CartBar({ count, total, label, onNext }: { count: number; total: number; label: string; onNext: () => void }) {
  return <div className={styles.cartBar}><div><span>{count ? count + " loại vật liệu đã chọn" : "Chưa chọn vật liệu"}</span><strong>{formatMoney(total)}</strong></div><button className={styles.primaryButton} disabled={count === 0} type="button" onClick={onNext}>{label}</button></div>;
}

function createSubmissionKey() {
  return "customer-order-" + Date.now() + "-" + Math.random().toString(36).slice(2, 14);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 0 }).format(value);
}
