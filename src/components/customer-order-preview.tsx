"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerPortalOrderAction } from "@/app/portal-actions";
import styles from "@/app/dat-hang/page.module.css";

type CustomerCatalogItem = {
  id: string;
  code: string;
  name: string;
  unitName: string;
  salePrice?: number;
  taxRate?: number;
  orderableOnline: boolean;
  availability: "in_stock" | "out_of_stock" | "quote_required";
};

type CustomerOrderPreviewProps = {
  products: CustomerCatalogItem[];
  canPlaceOrder: boolean;
  customerId?: string;
};

type WizardStep = 1 | 2 | 3;
const cartStorageKey = "hien-xa-customer-cart-v2";

export function CustomerOrderPreview({ products, canPlaceOrder, customerId }: CustomerOrderPreviewProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "credit_requested">("transfer");
  const [customerNote, setCustomerNote] = useState("");
  const [message, setMessage] = useState<string>();
  const [hydrated, setHydrated] = useState(false);
  const [requestingProductId, setRequestingProductId] = useState<string>();
  const [pending, startTransition] = useTransition();
  const submissionKey = useRef(createSubmissionKey());
  const availabilityRequestKeys = useRef<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(cartStorageKey) ?? "{}") as Record<string, unknown>;
      const validIds = new Set(products.filter((product) => product.availability === "in_stock").map((product) => product.id));
      const restored = Object.fromEntries(Object.entries(saved)
        .filter(([id, value]) => validIds.has(id) && typeof value === "number" && value > 0)
        .map(([id, value]) => [id, Math.floor(value as number)]));
      setQuantities(restored);
      setStep((current) => Object.keys(restored).length === 0 ? 1 : current);
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

  const refreshCatalog = useCallback(() => {
    setMessage("Đang cập nhật danh mục hàng hóa mới nhất.");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) refreshCatalog();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [refreshCatalog]);

  const selectedItems = useMemo(() => products
    .filter((product) => (quantities[product.id] ?? 0) > 0)
    .map((product) => ({ ...product, quantity: quantities[product.id] ?? 0 })), [products, quantities]);
  const netTotal = selectedItems.reduce((total, item) => total + item.quantity * (item.salePrice ?? 0), 0);
  const taxTotal = selectedItems.reduce((total, item) => total + item.quantity * (item.salePrice ?? 0) * (item.taxRate ?? 0), 0);
  const grossTotal = netTotal + taxTotal;

  function updateQuantity(product: CustomerCatalogItem, nextValue: number) {
    const safeValue = Number.isFinite(nextValue)
      ? Math.max(0, Math.min(Math.floor(nextValue), 1_000_000))
      : 0;
    setQuantities((current) => ({ ...current, [product.id]: safeValue }));
    setMessage(undefined);
  }

  async function askStoreAboutProduct(product: CustomerCatalogItem) {
    if (!canPlaceOrder || !customerId) {
      window.location.assign("/khach-hang/dang-nhap?returnTo=%2Fdat-hang");
      return;
    }
    const idempotencyKey = availabilityRequestKeys.current[product.id] ??= `catalog-availability:${product.id}:${crypto.randomUUID()}`;
    setRequestingProductId(product.id);
    setMessage(undefined);
    try {
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partyType: "customer",
          partyId: customerId,
          body: `Xin hỏi cửa hàng về hàng tạm hết: ${product.code} - ${product.name} (${product.unitName}).`,
          idempotencyKey
        })
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Chưa thể gửi yêu cầu hỏi hàng.");
      delete availabilityRequestKeys.current[product.id];
      setMessage("Đã gửi yêu cầu cho cửa hàng. Cửa hàng sẽ phản hồi trong mục Tin nhắn.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chưa thể gửi yêu cầu hỏi hàng. Vui lòng thử lại.");
    } finally {
      setRequestingProductId(undefined);
    }
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
        <a className={styles.brand} href="/dat-hang" aria-label="VLXD Hiền Xa - đặt vật liệu">
          <span className={styles.brandMark}>HX</span>
          <span><strong>VLXD Hiền Xa</strong><small>Đặt vật liệu trực tuyến</small></span>
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
            <div><span className={styles.catalogCount}>{products.length} vật tư</span><button className={styles.secondaryButton} type="button" onClick={refreshCatalog}>Cập nhật danh mục</button></div>
          </div>
          {products.length === 0 ? <div className={styles.emptyState}>Chưa có vật liệu công khai giá. Vui lòng liên hệ cửa hàng để được báo giá.</div> : (
            <div className={styles.productGrid}>
              {products.map((product) => {
                const quantity = quantities[product.id] ?? 0;
                const isAvailable = product.availability === "in_stock" && product.orderableOnline;
                const salePrice = product.salePrice;
                const taxRate = product.taxRate;
                const hasPublicPrice = salePrice !== undefined && taxRate !== undefined;
                const availabilityLabel = isAvailable
                  ? "Có thể đặt"
                  : product.availability === "out_of_stock"
                    ? "Tạm hết hàng"
                    : "Cần báo giá";
                return (
                  <article className={[styles.productCard, quantity > 0 ? styles.selectedProduct : ""].filter(Boolean).join(" ")} key={product.id}>
                    <div className={styles.productMeta}><span>{product.code}</span><span className={isAvailable ? styles.available : styles.unavailable}>{availabilityLabel}</span></div>
                    <h3>{product.name}</h3>
                    <p className={styles.price}>{hasPublicPrice ? <>{formatMoney(salePrice)}<small> / {product.unitName}</small></> : "Liên hệ để nhận giá"}</p>
                    <p className={styles.tax}>{hasPublicPrice ? <>Giá dự kiến trước VAT. VAT {formatPercent(taxRate)}. {isAvailable ? "Hàng đang có thể đặt." : "Hàng tạm hết, cô/chú có thể hỏi cửa hàng."}</> : "Vật tư chưa có giá hoặc VAT công khai. Cô/chú có thể hỏi cửa hàng."}</p>
                    {isAvailable ? <div className={styles.quantityControl}>
                      <button type="button" onClick={() => updateQuantity(product, quantity - 1)} disabled={quantity <= 0} aria-label={"Giảm số lượng " + product.name}>-</button>
                      <label><span>Số lượng ({product.unitName})</span><input type="number" min="0" max="1000000" value={quantity || ""} onChange={(event) => updateQuantity(product, Number(event.target.value))} /></label>
                      <button type="button" onClick={() => updateQuantity(product, quantity + 1)} aria-label={"Tăng số lượng " + product.name}>+</button>
                    </div> : <button className={styles.secondaryButton} type="button" disabled={requestingProductId === product.id} onClick={() => void askStoreAboutProduct(product)}>{requestingProductId === product.id ? "Đang gửi yêu cầu..." : "Hỏi cửa hàng"}</button>}
                  </article>
                );
              })}
            </div>
          )}
          {products.length > 0 ? <CartBar count={selectedItems.length} total={grossTotal} label="Tiếp tục nhập thông tin giao" onNext={goToDelivery} /> : null}
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
            <div><h3>Vật liệu đã chọn</h3><ul className={styles.quoteLines}>{selectedItems.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{formatQuantity(item.quantity)} {item.unitName} x {formatMoney(item.salePrice ?? 0)}</small></span><b>{formatMoney(item.quantity * (item.salePrice ?? 0) * (1 + (item.taxRate ?? 0)))}</b></li>)}</ul></div>
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
      <footer className={styles.footer}>VLXD Hiền Xa xác nhận lại giá, số lượng và thời gian giao trước khi thực hiện.</footer>
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
