import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { MobileSession } from "../lib/session";
import { createNativeIdempotencyKey, nativeErpGet, nativeErpPost, nativeErpUpload } from "../lib/native-erp-api";
import { getNativeModulesForSession, getRoleNavigationManifest, type NativeModuleId as ModuleId } from "../lib/role-navigation";
import { useAppTheme } from "../lib/ui";
import { registerMobileForegroundRefresh } from "../lib/mobile-lifecycle";
import { AppButton, ReviewSheet, StateMessage, StatusChip } from "./mobile-ui";
import {
  NativeLabeledSelectField,
  NativeLabeledTextField,
  NativeModuleActionForm,
  NativeReviewConfirmationCard,
  NativeWorkflowFormShell,
  NativeWorkflowNoticeCard,
  type NativeActionField,
  type NativeReviewSummary,
  type NativeWorkflowNotice
} from "./native-workflow-form";

type ModulePayload = { ok?: boolean; revision?: number; syncedAt?: string; summary?: string; [key: string]: unknown };
type CatalogItem = { id: string; displayName?: string; productCode?: string; productName?: string; unitName?: string; code?: string; name?: string; plateNumber?: string; status?: string; salePrice?: number; saleTaxRate?: number; roleType?: string };
type CatalogPayload = ModulePayload & { customers?: CatalogItem[]; suppliers?: CatalogItem[]; products?: CatalogItem[]; warehouses?: CatalogItem[]; vehicles?: CatalogItem[]; employees?: CatalogItem[] };
type WorkflowProps = { module: ModuleId; payload: ModulePayload; catalog?: CatalogPayload; session: MobileSession; onCompleted: () => Promise<void> };

const commerceSteps = [
  { id: "input", label: "Nhập thông tin", description: "Chọn đối tác, hàng và điều khoản." },
  { id: "review", label: "Rà soát", description: "Máy chủ tính lại dữ liệu hiện hành." },
  { id: "confirm", label: "Xác nhận", description: "Tạo chứng từ với mã chống ghi trùng." }
];

export function NativeManagementWorkspace({ session }: { session: MobileSession }) {
  const theme = useAppTheme();
  const manifest = useMemo(() => getRoleNavigationManifest(session.user.role, session.user.moduleIds), [session.user.moduleIds, session.user.role]);
  const modules = useMemo(
    () => getNativeModulesForSession(session.user.role, session.user.moduleIds),
    [session.user.moduleIds, session.user.role]
  );
  const [activeId, setActiveId] = useState<ModuleId>();
  const active = modules.find((module) => module.id === activeId) ?? modules[0];
  const [payload, setPayload] = useState<ModulePayload>();
  const [catalog, setCatalog] = useState<CatalogPayload>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string>();
  const [reviewRequest, setReviewRequest] = useState<{ title: string; message: string; confirmLabel: string; execute: () => Promise<void> }>();
  const [reviewPending, setReviewPending] = useState(false);

  const load = useCallback(async () => {
    if (!activeId || !active) return;
    setLoading(true);
    setError(undefined);
    try {
      const nextPayload = await nativeErpGet<ModulePayload>(session, active.path);
      setPayload(nextPayload);
      if (active.id === "catalog") {
        setCatalog(nextPayload as CatalogPayload);
      } else if (moduleNeedsCatalog(active.id)) {
        try {
          setCatalog(await nativeErpGet<CatalogPayload>(session, "/api/mobile/catalog"));
        } catch {
          setCatalog(undefined);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải nghiệp vụ.");
    } finally {
      setLoading(false);
    }
  }, [active, session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => registerMobileForegroundRefresh(load), [load]);

  const runDocumentAction = useCallback(async (path: string, action: "confirm" | "allocate", version: number, label: string) => {
    try {
      const detail = await nativeErpGet<{ review?: Record<string, unknown> }>(session, path);
      const review = reviewText(detail.review ?? {});
      setReviewRequest({
        title: "Rà soát trước khi xác nhận",
        message: `${label}\n\n${review}`,
        confirmLabel: "Xác nhận",
        execute: async () => {
            setPendingAction(`${path}:${action}`);
            try {
              const result = await nativeErpPost<{ summary: string }>(session, path, { action, expectedVersion: version, idempotencyKey: createNativeIdempotencyKey(`mobile-${action}`) });
              Alert.alert("Đã xử lý", result.summary);
              await load();
            } catch (cause) {
              Alert.alert("Chưa thể xử lý", cause instanceof Error ? cause.message : "Không thể thực hiện thao tác.");
            } finally {
              setPendingAction(undefined);
            }
        }
      });
    } catch (cause) {
      Alert.alert("Chưa thể rà soát", cause instanceof Error ? cause.message : "Không thể lấy dữ liệu rà soát.");
    }
  }, [load, session]);

  const runContextAction = useCallback(async (path: string, body: Record<string, unknown>, label: string) => {
    setReviewRequest({
      title: "Xác nhận thao tác",
      message: label,
      confirmLabel: "Xác nhận",
      execute: async () => {
          const key = `${path}:${String(body.action ?? "post")}`;
          setPendingAction(key);
          try {
            const result = await nativeErpPost<{ summary: string }>(session, path, { ...body, idempotencyKey: createNativeIdempotencyKey("mobile-operation") });
            Alert.alert("Đã xử lý", result.summary);
            await load();
          } catch (cause) {
            Alert.alert("Chưa thể xử lý", cause instanceof Error ? cause.message : "Không thể thực hiện thao tác.");
          } finally {
            setPendingAction(undefined);
          }
      }
    });
  }, [load, session]);

  const runFinancialAction = useCallback(async (path: string, body: Record<string, unknown>) => {
    try {
      const preview = await nativeErpPost<{ review?: Record<string, unknown> }>(session, path, { ...body, review: true });
      setReviewRequest({
        title: "Rà soát trước khi ghi sổ",
        message: reviewText(preview.review ?? {}),
        confirmLabel: "Xác nhận ghi sổ",
        execute: async () => {
            const key = `${path}:${String(body.action ?? "confirm")}`;
            setPendingAction(key);
            try {
              const result = await nativeErpPost<{ summary: string }>(session, path, { ...body, confirm: true, idempotencyKey: createNativeIdempotencyKey("mobile-finance") });
              Alert.alert("Đã xử lý", result.summary);
              await load();
            } catch (cause) {
              Alert.alert("Chưa thể ghi sổ", cause instanceof Error ? cause.message : "Không thể thực hiện thao tác tài chính.");
            } finally {
              setPendingAction(undefined);
            }
        }
      });
    } catch (cause) {
      Alert.alert("Chưa thể rà soát", cause instanceof Error ? cause.message : "Không thể kiểm tra hậu quả tài chính.");
    }
  }, [load, session]);

  if (!active) return <StateMessage title="Chưa có nghiệp vụ được cấp quyền" message="Liên hệ Chủ cửa hàng để được cấp module phù hợp." />;
  if (!activeId) return (
    <ScrollView contentContainerStyle={[styles.directory, { backgroundColor: theme.background }]}>
      <Text style={[styles.eyebrow, { color: theme.brand }]}>NGHIỆP VỤ THEO QUYỀN</Text>
      <Text style={[styles.title, { color: theme.text }]}>{manifest.heading}</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>Chọn một mục để xem dữ liệu và thao tác được phép. Các bước ảnh hưởng tiền hoặc kho luôn phải rà soát trước khi xác nhận.</Text>
      <View style={styles.directoryGrid}>
        {modules.map((module) => <Pressable accessibilityHint={module.description} accessibilityRole="button" key={module.id} onPress={() => setActiveId(module.id)} style={({ pressed }) => [styles.directoryCard, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.directoryPressed]}><View style={styles.directoryCopy}><Text style={[styles.directoryTitle, { color: theme.text }]}>{module.label}</Text><Text style={[styles.directoryDescription, { color: theme.textMuted }]}>{module.description}</Text></View><Text style={[styles.directoryOpen, { color: theme.brand }]}>Mở mục này</Text></Pressable>)}
      </View>
    </ScrollView>
  );
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}> 
        <AppButton label="Về danh sách nghiệp vụ" onPress={() => setActiveId(undefined)} tone="secondary" style={styles.directoryBack} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.moduleHeading, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Text style={[styles.moduleTitle, { color: theme.text }]}>{active.label}</Text>
          <Text style={[styles.moduleDescription, { color: theme.textMuted }]}>{active.description}</Text>
          {payload?.syncedAt ? <StatusChip label="Đã đồng bộ" tone="active" /> : null}
        </View>
        {loading ? <View style={styles.loading}><ActivityIndicator color={theme.brand} /><Text style={[styles.loadingText, { color: theme.textMuted }]}>Đang tải dữ liệu đã được cấp quyền...</Text></View> : null}
        {error ? <StateMessage title="Chưa thể mở nghiệp vụ" message={error} actionLabel="Tải lại" onAction={() => void load()} /> : null}
        {!loading && !error && payload ? (
          <ModuleContent
            catalog={catalog}
            module={active.id}
            onCompleted={load}
            onContextAction={runContextAction}
            onDocumentAction={runDocumentAction}
            onFinancialAction={runFinancialAction}
            payload={payload}
            pendingAction={pendingAction}
            session={session}
            theme={theme}
          />
        ) : null}
      </ScrollView>
      <ReviewSheet confirmLabel={reviewRequest?.confirmLabel} message={reviewRequest?.message ?? ""} onConfirm={() => void (async () => { if (!reviewRequest) return; setReviewPending(true); try { await reviewRequest.execute(); setReviewRequest(undefined); } finally { setReviewPending(false); } })()} onDismiss={() => setReviewRequest(undefined)} pending={reviewPending} title={reviewRequest?.title ?? "Rà soát thao tác"} visible={Boolean(reviewRequest)} />
    </View>
  );
}

function ModuleContent({ catalog, module, onCompleted, onContextAction, onDocumentAction, onFinancialAction, payload, pendingAction, session, theme }: {
  catalog?: CatalogPayload;
  module: ModuleId;
  onCompleted: () => Promise<void>;
  onDocumentAction: (path: string, action: "confirm" | "allocate", version: number, label: string) => Promise<void>;
  onContextAction: (path: string, body: Record<string, unknown>, label: string) => Promise<void>;
  onFinancialAction: (path: string, body: Record<string, unknown>) => Promise<void>;
  payload: ModulePayload;
  pendingAction?: string;
  session: MobileSession;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const records = recordsForModule(module, payload);
  const summary = module === "reporting" ? reportSummary(payload.report) : undefined;
  return (
    <View style={styles.stack}>
      {summary ? <View style={styles.metricGrid}>{summary.map((item) => <View key={item.label} style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{item.label}</Text><Text style={[styles.metricValue, { color: theme.text }]}>{item.value}</Text></View>)}</View> : null}
      {module === "audit" && isRecord(payload.integrity) ? <View style={[styles.notice, { backgroundColor: theme.brandSoft, borderColor: theme.border }]}><Text style={[styles.noticeTitle, { color: theme.text }]}>Tình trạng audit: {stringValue(payload.integrity.status)}</Text><Text style={[styles.noticeText, { color: theme.textMuted }]}>Tổng sự kiện: {stringValue(payload.integrity.auditCount)}. Hãy mở từng sự kiện để đối chiếu khi có cảnh báo.</Text></View> : null}
      <NativeWorkflowComposer catalog={catalog} module={module} onCompleted={onCompleted} payload={payload} session={session} />
      {records.length === 0 ? <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.emptyTitle, { color: theme.text }]}>Chưa có dữ liệu cần xử lý</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>Dữ liệu sẽ xuất hiện khi có chứng từ trong phạm vi quyền của bạn.</Text></View> : records.map((record, index) => <NativeRecordCard key={typeof record.id === "string" ? record.id : `${module}-${index}`} module={module} record={record} revision={payload.revision} theme={theme} pendingAction={pendingAction} onDocumentAction={onDocumentAction} onContextAction={onContextAction} onFinancialAction={onFinancialAction} />)}
    </View>
  );
}

function NativeWorkflowComposer({ catalog, module, onCompleted, payload, session }: WorkflowProps) {
  if (module === "sales" || module === "procurement") return <CommercialDraftWorkflow catalog={catalog} kind={module === "sales" ? "sales" : "procurement"} onCompleted={onCompleted} session={session} />;
  if (module === "inventory") return <InventoryWorkflow catalog={catalog} onCompleted={onCompleted} session={session} />;
  if (module === "delivery") return <DeliveryWorkflow onCompleted={onCompleted} payload={payload} session={session} />;
  if (module === "receivables" || module === "payables" || module === "cash") return <FinanceWorkflow catalog={catalog} module={module} onCompleted={onCompleted} session={session} />;
  if (module === "workforce") return <WorkforceWorkflow catalog={catalog} onCompleted={onCompleted} payload={payload} session={session} />;
  if (module === "import") return <ImportWorkflow onCompleted={onCompleted} session={session} />;
  if (module === "admin") return <AdminWorkflow onCompleted={onCompleted} payload={payload} session={session} />;
  if (module === "catalog") return <UnavailableWorkflow title="Danh mục native đang ở chế độ xem" message="Máy chủ hiện chỉ công bố dữ liệu danh mục đã lọc theo quyền. Chưa có route lệnh danh mục chuyên biệt, vì vậy ứng dụng không gửi thao tác tạo hoặc sửa danh mục đoán mò." />;
  if (module === "audit") return <UnavailableWorkflow title="Audit chỉ đọc trên mobile" message="Nhật ký và trạng thái toàn vẹn được xem trực tiếp trong ứng dụng. Không có thao tác sửa audit hoặc ghi log thủ công." />;
  if (module === "reporting") return <UnavailableWorkflow title="Báo cáo đã lấy từ sổ chi tiết" message="Báo cáo hiện hiển thị số liệu server-side. Tải gói báo cáo có xác thực sẽ được bật khi route tải tệp chuyên biệt hoàn tất." />;
  return null;
}

function CommercialDraftWorkflow({ catalog, kind, onCompleted, session }: { catalog?: CatalogPayload; kind: "sales" | "procurement"; onCompleted: () => Promise<void>; session: MobileSession }) {
  type Values = { partyId: string; productUnitId: string; quantity: string; unitCost: string; taxRate: string; discountKind: string; discountValue: string; destinationType: string; customerId: string; paymentTermDays: string; paymentTermsNote: string; deliveryDate: string; freight: string; freightTaxRate: string };
  const [values, setValues] = useState<Values>({ partyId: "", productUnitId: "", quantity: "", unitCost: "", taxRate: "0.1", discountKind: "percentage", discountValue: "", destinationType: "warehouse", customerId: "", paymentTermDays: "", paymentTermsNote: "", deliveryDate: "", freight: "", freightTaxRate: "0.1" });
  const [review, setReview] = useState<NativeReviewSummary>();
  const [notice, setNotice] = useState<NativeWorkflowNotice>();
  const [pending, setPending] = useState(false);
  const partyLabel = kind === "sales" ? "Khách hàng" : "Nhà cung cấp";
  const partyOptions = itemOptions(kind === "sales" ? catalog?.customers : catalog?.suppliers, partyLabel);
  const productOptions = productSelectOptions(catalog?.products);
  const customerOptions = itemOptions(catalog?.customers, "Khách hàng");
  const selectedProduct = catalog?.products?.find((product) => product.id === values.productUnitId);
  const update = (key: keyof Values, value: string) => { setReview(undefined); setNotice(undefined); setValues((current) => ({ ...current, [key]: value })); };
  const buildInput = (): Record<string, unknown> | undefined => {
    const quantity = numberValue(values.quantity);
    const paymentTermDays = optionalInteger(values.paymentTermDays);
    const freight = optionalNumber(values.freight);
    const taxRate = numberValue(values.taxRate);
    const freightTaxRate = numberValue(values.freightTaxRate);
    if (!values.partyId || !values.productUnitId || !quantity || quantity <= 0) {
      setNotice({ status: "error", title: "Thiếu thông tin bắt buộc", message: `Chọn ${partyLabel.toLowerCase()}, vật tư và số lượng lớn hơn 0 trước khi rà soát.` });
      return undefined;
    }
    if (kind === "sales") {
      return {
        customerId: values.partyId,
        lines: [{ productUnitId: values.productUnitId, quantity }],
        paymentTermDays,
        paymentTermsNote: optionalText(values.paymentTermsNote),
        promisedDeliveryDate: optionalText(values.deliveryDate),
        deliveryCharge: freight !== undefined && freight > 0 ? { netAmount: freight, taxRate: freightTaxRate ?? 0 } : undefined
      };
    }
    const unitCost = numberValue(values.unitCost);
    if (unitCost === undefined || unitCost < 0 || taxRate === undefined || taxRate < 0 || !selectedProduct?.unitName) {
      setNotice({ status: "error", title: "Thiếu giá hoặc thuế mua", message: "Phiếu mua cần đơn giá, VAT và đơn vị tính để máy chủ tạo ảnh chụp điều khoản." });
      return undefined;
    }
    const discountValue = optionalNumber(values.discountValue);
    return {
      supplierId: values.partyId,
      lines: [{
        productUnitId: values.productUnitId,
        orderedQuantity: quantity,
        unitCost,
        taxRate,
        unitName: selectedProduct.unitName,
        destinationType: values.destinationType,
        customerId: values.destinationType === "customer_direct" ? optionalText(values.customerId) : undefined,
        discount: discountValue !== undefined && discountValue > 0 ? { kind: values.discountKind, value: discountValue } : undefined
      }],
      paymentTermDays,
      paymentTermsNote: optionalText(values.paymentTermsNote),
      expectedDeliveryDate: optionalText(values.deliveryDate),
      freightCharge: freight !== undefined && freight > 0 ? { netAmount: freight, taxRate: freightTaxRate ?? 0 } : undefined
    };
  };
  const reviewDraft = async () => {
    const input = buildInput();
    if (!input) return;
    setPending(true);
    try {
      const path = kind === "sales" ? "/api/mobile/sales" : "/api/mobile/procurement";
      const result = await nativeErpPost<{ review?: Record<string, unknown> }>(session, path, { action: "reviewDraft", ...input });
      setReview(toReviewSummary(result.review, kind === "sales" ? "Rà soát đơn bán nháp" : "Rà soát phiếu mua nháp"));
      setNotice(undefined);
    } catch (cause) {
      setNotice({ status: "error", title: "Chưa thể rà soát", message: errorMessage(cause) });
    } finally {
      setPending(false);
    }
  };
  const createDraft = async () => {
    const input = buildInput();
    if (!input) return;
    setPending(true);
    try {
      const path = kind === "sales" ? "/api/mobile/sales" : "/api/mobile/procurement";
      const result = await nativeErpPost<{ summary?: string }>(session, path, { action: "createDraft", ...input, idempotencyKey: createNativeIdempotencyKey(kind === "sales" ? "mobile-sales-draft" : "mobile-purchase-draft") });
      setNotice({ status: "success", title: "Đã tạo chứng từ nháp", message: result.summary ?? "Máy chủ đã tạo chứng từ nháp với ảnh chụp giá và điều khoản hiện tại." });
      setReview(undefined);
      await onCompleted();
    } catch (cause) {
      setNotice({ status: "error", title: "Chưa thể tạo chứng từ", message: errorMessage(cause) });
    } finally {
      setPending(false);
    }
  };
  const fields: NativeActionField<Values>[] = [
    { kind: "select", key: "partyId", label: partyLabel, options: partyOptions, helperText: `Chỉ chọn ${partyLabel.toLowerCase()} đang hoạt động trong dữ liệu máy chủ.` },
    { kind: "select", key: "productUnitId", label: "Vật tư", options: productOptions, helperText: kind === "sales" ? "Giá và VAT bán được máy chủ tính lại, không lấy từ điện thoại." : "Đơn giá mua là giá đã thỏa thuận cho phiếu mua này." },
    { kind: "text", key: "quantity", label: "Số lượng", placeholder: "Ví dụ: 10", keyboardType: "decimal-pad" as const },
    ...(kind === "procurement" ? [
      { kind: "text" as const, key: "unitCost" as const, label: "Đơn giá mua trước VAT", placeholder: "Ví dụ: 150000", keyboardType: "decimal-pad" as const },
      { kind: "text" as const, key: "taxRate" as const, label: "VAT mua (dạng 0.1 cho 10%)", placeholder: "0.1", keyboardType: "decimal-pad" as const },
      { kind: "select" as const, key: "destinationType" as const, label: "Nơi nhận", options: [{ value: "warehouse", label: "Nhập kho cửa hàng" }, { value: "customer_direct", label: "Giao thẳng khách" }] },
      ...(values.destinationType === "customer_direct" ? [{ kind: "select" as const, key: "customerId" as const, label: "Khách nhận hàng", options: customerOptions }] : []),
      { kind: "select" as const, key: "discountKind" as const, label: "Loại chiết khấu", options: [{ value: "percentage", label: "Phần trăm" }, { value: "amount", label: "Số tiền" }] },
      { kind: "text" as const, key: "discountValue" as const, label: "Chiết khấu (nếu có)", placeholder: "Để trống nếu không có", keyboardType: "decimal-pad" as const }
    ] : []),
    { kind: "text", key: "paymentTermDays", label: "Hạn thanh toán (ngày)", placeholder: "Để trống nếu chưa chốt", keyboardType: "number-pad" as const },
    { kind: "text", key: "paymentTermsNote", label: "Điều khoản thanh toán", placeholder: "Ví dụ: Chuyển khoản trong 7 ngày", multiline: true },
    { kind: "text", key: "deliveryDate", label: kind === "sales" ? "Ngày giao dự kiến" : "Ngày nhận dự kiến", placeholder: "YYYY-MM-DD" },
    { kind: "text", key: "freight", label: kind === "sales" ? "Phí giao khách (trước VAT)" : "Cước mua phân bổ (trước VAT)", placeholder: "Để trống nếu không có", keyboardType: "decimal-pad" as const },
    { kind: "text", key: "freightTaxRate", label: "VAT cước (dạng 0.1 cho 10%)", placeholder: "0.1", keyboardType: "decimal-pad" as const }
  ];
  return (
    <NativeWorkflowFormShell currentStep={review ? 1 : 0} description="Điện thoại chỉ gửi ý định. Giá, VAT, chiết khấu, tồn và số tiền cuối cùng do máy chủ kiểm tra lại." steps={commerceSteps} title={kind === "sales" ? "Tạo đơn bán nháp" : "Tạo phiếu mua nháp"}>
      <NativeModuleActionForm fields={fields} values={values} onChange={update} onReview={() => void reviewDraft()} review={review} onConfirm={() => void createDraft()} confirmLabel={kind === "sales" ? "Tạo đơn bán nháp" : "Tạo phiếu mua nháp"} pending={pending} notice={notice} reviewLabel="Rà soát giá và điều khoản" />
    </NativeWorkflowFormShell>
  );
}

function InventoryWorkflow({ catalog, onCompleted, session }: { catalog?: CatalogPayload; onCompleted: () => Promise<void>; session: MobileSession }) {
  type Values = { action: string; sourceWarehouseId: string; destinationWarehouseId: string; warehouseId: string; productUnitId: string; quantity: string; reason: string };
  const [values, setValues] = useState<Values>({ action: "transfer", sourceWarehouseId: "", destinationWarehouseId: "", warehouseId: "", productUnitId: "", quantity: "", reason: "" });
  const [review, setReview] = useState<NativeReviewSummary>();
  const [notice, setNotice] = useState<NativeWorkflowNotice>();
  const [pending, setPending] = useState(false);
  const warehouses = warehouseOptions(catalog?.warehouses);
  const products = productSelectOptions(catalog?.products);
  const update = (key: keyof Values, value: string) => { setReview(undefined); setNotice(undefined); setValues((current) => ({ ...current, [key]: value })); };
  const build = (): { path: string; body: Record<string, unknown>; review: NativeReviewSummary } | undefined => {
    const quantity = numberValue(values.quantity);
    if (!values.productUnitId || quantity === undefined || quantity < 0 || values.reason.trim().length < 5) {
      setNotice({ status: "error", title: "Thiếu thông tin kiểm kê", message: "Chọn vật tư, nhập số lượng hợp lệ và lý do tối thiểu 5 ký tự." });
      return undefined;
    }
    if (values.action === "transfer") {
      if (!values.sourceWarehouseId || !values.destinationWarehouseId || values.sourceWarehouseId === values.destinationWarehouseId || quantity <= 0) {
        setNotice({ status: "error", title: "Chưa thể chuyển kho", message: "Chọn hai kho khác nhau và số lượng chuyển lớn hơn 0." });
        return undefined;
      }
      return {
        path: "/api/mobile/inventory/transfers",
        body: { sourceWarehouseId: values.sourceWarehouseId, destinationWarehouseId: values.destinationWarehouseId, productUnitId: values.productUnitId, quantity, reason: values.reason.trim() },
        review: { title: "Rà soát chuyển kho", description: "Máy chủ sẽ chặn xuất âm kho và chỉ ghi inventory movement append-only.", lines: [{ label: "Số lượng chuyển", value: String(quantity), emphasis: "strong" }, { label: "Lý do", value: values.reason.trim() }], warnings: ["Không thể sửa tồn trực tiếp trên điện thoại."] }
      };
    }
    if (!values.warehouseId) {
      setNotice({ status: "error", title: "Chưa chọn kho", message: "Chọn kho cần ghi nhận kết quả kiểm kê." });
      return undefined;
    }
    return {
      path: "/api/mobile/inventory/count-adjustments",
      body: { warehouseId: values.warehouseId, productUnitId: values.productUnitId, countedQuantity: quantity, reason: values.reason.trim() },
      review: { title: "Rà soát điều chỉnh kiểm kê", description: "Máy chủ sẽ tính chênh lệch từ inventory movement hiện có trước khi post điều chỉnh.", lines: [{ label: "Số lượng đếm thực tế", value: String(quantity), emphasis: "strong" }, { label: "Lý do", value: values.reason.trim() }], warnings: ["Điều chỉnh tạo phát sinh kho mới; chứng từ đã post chỉ có thể đảo."] }
    };
  };
  const requestReview = () => { const next = build(); if (next) setReview(next.review); };
  const confirm = async () => {
    const next = build();
    if (!next) return;
    setPending(true);
    try {
      const result = await nativeErpPost<{ summary?: string }>(session, next.path, { ...next.body, idempotencyKey: createNativeIdempotencyKey(`mobile-inventory-${values.action}`) });
      setNotice({ status: "success", title: "Đã gửi nghiệp vụ kho", message: result.summary ?? "Máy chủ đã ghi nhận thao tác kho." });
      setReview(undefined);
      await onCompleted();
    } catch (cause) {
      setNotice({ status: "error", title: "Chưa thể ghi nhận kho", message: errorMessage(cause) });
    } finally { setPending(false); }
  };
  const fields: NativeActionField<Values>[] = [
    { kind: "select", key: "action", label: "Loại thao tác", options: [{ value: "transfer", label: "Chuyển giữa hai kho" }, { value: "count", label: "Kiểm kê và điều chỉnh" }] },
    ...(values.action === "transfer" ? [
      { kind: "select" as const, key: "sourceWarehouseId" as const, label: "Kho xuất", options: warehouses },
      { kind: "select" as const, key: "destinationWarehouseId" as const, label: "Kho nhận", options: warehouses }
    ] : [{ kind: "select" as const, key: "warehouseId" as const, label: "Kho kiểm kê", options: warehouses }]),
    { kind: "select", key: "productUnitId", label: "Vật tư", options: products },
    { kind: "text", key: "quantity", label: values.action === "transfer" ? "Số lượng chuyển" : "Số lượng đếm thực tế", placeholder: "Ví dụ: 10", keyboardType: "decimal-pad" as const },
    { kind: "text", key: "reason", label: "Lý do", placeholder: "Nêu rõ nguồn gốc thao tác", multiline: true }
  ];
  return <NativeWorkflowFormShell currentStep={review ? 1 : 0} description="Kho chỉ tạo phát sinh append-only. Mọi số dư được máy chủ tính từ movement, không nhập tay." steps={commerceSteps} title="Kho: chuyển hoặc kiểm kê"><NativeModuleActionForm fields={fields} values={values} onChange={update} onReview={requestReview} review={review} onConfirm={() => void confirm()} confirmLabel="Xác nhận gửi thao tác kho" pending={pending} notice={notice} reviewLabel="Rà soát thao tác kho" /></NativeWorkflowFormShell>;
}

function DeliveryWorkflow({ onCompleted, payload, session }: { onCompleted: () => Promise<void>; payload: ModulePayload; session: MobileSession }) {
  type Values = { deliveryJobId: string; action: string; reason: string };
  const jobs = recordsForModule("delivery", payload);
  const jobOptions = jobs.filter((job) => typeof job.id === "string").map((job) => ({ value: String(job.id), label: `${stringValue(job.documentNo, "Chuyến giao")} · ${stringValue(job.status)}` }));
  const [values, setValues] = useState<Values>({ deliveryJobId: jobOptions[0]?.value ?? "", action: "start_loading", reason: "" });
  const [review, setReview] = useState<NativeReviewSummary>();
  const [notice, setNotice] = useState<NativeWorkflowNotice>();
  const [pending, setPending] = useState(false);
  const selected = jobs.find((job) => job.id === values.deliveryJobId);
  const selectedStatus = stringValue(selected?.status).toLowerCase();
  const availableActions = selectedStatus === "assigned" ? [{ value: "start_loading", label: "Bắt đầu bốc hàng" }, { value: "fail", label: "Báo dừng chuyến" }] : selectedStatus === "loading" ? [{ value: "dispatch", label: "Xuất phát giao hàng" }, { value: "fail", label: "Báo dừng chuyến" }] : [{ value: "", label: "Chọn chuyến đang được phân công", disabled: true }];
  const update = (key: keyof Values, value: string) => {
    setReview(undefined);
    setNotice(undefined);
    if (key === "deliveryJobId") {
      setValues((current) => ({ ...current, deliveryJobId: value, action: "" }));
      return;
    }
    setValues((current) => ({ ...current, [key]: value }));
  };
  const build = (): Record<string, unknown> | undefined => {
    if (!values.deliveryJobId || !values.action) { setNotice({ status: "error", title: "Chưa thể cập nhật chuyến", message: "Chỉ chuyến được phân công ở trạng thái phù hợp mới có thể chuyển bước." }); return undefined; }
    if (values.action === "fail" && values.reason.trim().length < 5) { setNotice({ status: "error", title: "Cần lý do", message: "Nêu rõ lý do dừng chuyến, tối thiểu 5 ký tự." }); return undefined; }
    return { action: values.action, deliveryJobId: values.deliveryJobId, ...(values.action === "fail" ? { reason: values.reason.trim() } : {}) };
  };
  const requestReview = () => { const body = build(); if (body) setReview({ title: "Rà soát trạng thái chuyến", description: "Máy chủ sẽ kiểm tra quyền điều phối, trạng thái chuyến và điều kiện GPS trước khi chuyển bước.", lines: [{ label: "Chuyến giao", value: stringValue(selected?.documentNo, values.deliveryJobId) }, { label: "Thao tác", value: availableActions.find((item) => item.value === values.action)?.label ?? values.action, emphasis: "strong" }], warnings: values.action === "dispatch" ? ["GPS chỉ được bật bởi tài xế được phân công khi chuyến đã ở trạng thái đang giao."] : undefined }); };
  const confirm = async () => {
    const body = build(); if (!body) return;
    setPending(true);
    try {
      const result = await nativeErpPost<{ summary?: string }>(session, "/api/mobile/delivery/workflow", { ...body, idempotencyKey: createNativeIdempotencyKey("mobile-delivery-workflow") });
      setNotice({ status: "success", title: "Đã cập nhật chuyến", message: result.summary ?? "Máy chủ đã cập nhật trạng thái chuyến giao." }); setReview(undefined); await onCompleted();
    } catch (cause) { setNotice({ status: "error", title: "Chưa thể cập nhật chuyến", message: errorMessage(cause) }); } finally { setPending(false); }
  };
  const fields: NativeActionField<Values>[] = [
    { kind: "select", key: "deliveryJobId", label: "Chuyến giao được phân công", options: jobOptions },
    { kind: "select", key: "action", label: "Bước tiếp theo", options: availableActions, disabled: !values.deliveryJobId || !selected },
    ...(values.action === "fail" ? [{ kind: "text" as const, key: "reason" as const, label: "Lý do dừng chuyến", placeholder: "Mô tả sự cố", multiline: true }] : [])
  ];
  return <NativeWorkflowFormShell currentStep={review ? 1 : 0} description="Tạo hoặc gán chuyến chưa có route native chuyên biệt. Màn này chỉ chuyển trạng thái an toàn của chuyến đã được phân công." steps={commerceSteps} title="Điều phối chuyến giao"><NativeModuleActionForm disabled={!jobs.length} fields={fields} values={values} onChange={update} onReview={requestReview} review={review} onConfirm={() => void confirm()} confirmLabel="Xác nhận chuyển trạng thái" pending={pending} notice={notice ?? (!jobs.length ? { status: "empty", title: "Chưa có chuyến được phép xử lý", message: "Chọn hoặc gán chuyến từ luồng điều phối đã được cấp quyền trước." } : undefined)} reviewLabel="Rà soát chuyến giao" /></NativeWorkflowFormShell>;
}

function FinanceWorkflow({ catalog, module, onCompleted, session }: { catalog?: CatalogPayload; module: "receivables" | "payables" | "cash"; onCompleted: () => Promise<void>; session: MobileSession }) {
  type Values = { partyId: string; amount: string; direction: string; category: string; description: string };
  const [values, setValues] = useState<Values>({ partyId: "", amount: "", direction: "in", category: "", description: "" });
  const [review, setReview] = useState<NativeReviewSummary>();
  const [notice, setNotice] = useState<NativeWorkflowNotice>();
  const [pending, setPending] = useState(false);
  const path = module === "receivables" ? "/api/mobile/receivables" : module === "payables" ? "/api/mobile/payables" : "/api/mobile/cash";
  const update = (key: keyof Values, value: string) => { setReview(undefined); setNotice(undefined); setValues((current) => ({ ...current, [key]: value })); };
  const build = (): Record<string, unknown> | undefined => {
    const amount = numberValue(values.amount);
    if (amount === undefined || amount <= 0) { setNotice({ status: "error", title: "Số tiền chưa hợp lệ", message: "Nhập số tiền lớn hơn 0 trước khi rà soát." }); return undefined; }
    if (module === "receivables") { if (!values.partyId) { setNotice({ status: "error", title: "Chưa chọn khách hàng", message: "Chọn đúng khách hàng để máy chủ kiểm tra phải thu." }); return undefined; } return { action: "createPaymentDraft", customerId: values.partyId, amount }; }
    if (module === "payables") { if (!values.partyId) { setNotice({ status: "error", title: "Chưa chọn nhà cung cấp", message: "Chọn đúng nhà cung cấp để máy chủ kiểm tra phải trả." }); return undefined; } return { action: "createPaymentDraft", supplierId: values.partyId, amount }; }
    if (values.category.trim().length < 2 || values.description.trim().length < 2) { setNotice({ status: "error", title: "Thiếu nội dung phiếu quỹ", message: "Nhập nhóm thu/chi và diễn giải tối thiểu 2 ký tự." }); return undefined; }
    return { action: "createVoucherDraft", direction: values.direction, category: values.category.trim(), description: values.description.trim(), amount };
  };
  const requestReview = async () => {
    const body = build(); if (!body) return;
    setPending(true);
    try { const result = await nativeErpPost<{ review?: Record<string, unknown> }>(session, path, { ...body, review: true }); setReview(toReviewSummary(result.review, "Rà soát hậu quả tài chính")); }
    catch (cause) { setNotice({ status: "error", title: "Chưa thể rà soát", message: errorMessage(cause) }); }
    finally { setPending(false); }
  };
  const confirm = async () => {
    const body = build(); if (!body) return;
    setPending(true);
    try { const result = await nativeErpPost<{ summary?: string }>(session, path, { ...body, confirm: true, idempotencyKey: createNativeIdempotencyKey(`mobile-${module}-draft`) }); setNotice({ status: "success", title: "Đã ghi nhận phiếu nháp", message: result.summary ?? "Máy chủ đã ghi nhận phiếu nháp." }); setReview(undefined); await onCompleted(); }
    catch (cause) { setNotice({ status: "error", title: "Chưa thể ghi nhận", message: errorMessage(cause) }); }
    finally { setPending(false); }
  };
  const fields: NativeActionField<Values>[] = module === "receivables" ? [
    { kind: "select", key: "partyId", label: "Khách hàng", options: itemOptions(catalog?.customers, "Khách hàng") },
    { kind: "text", key: "amount", label: "Số tiền thu", placeholder: "Ví dụ: 1000000", keyboardType: "decimal-pad" as const }
  ] : module === "payables" ? [
    { kind: "select", key: "partyId", label: "Nhà cung cấp", options: itemOptions(catalog?.suppliers, "Nhà cung cấp") },
    { kind: "text", key: "amount", label: "Số tiền chi", placeholder: "Ví dụ: 1000000", keyboardType: "decimal-pad" as const }
  ] : [
    { kind: "select", key: "direction", label: "Loại phiếu", options: [{ value: "in", label: "Phiếu thu" }, { value: "out", label: "Phiếu chi" }] },
    { kind: "text", key: "category", label: "Nhóm thu/chi", placeholder: "Ví dụ: Chi phí vận chuyển" },
    { kind: "text", key: "description", label: "Diễn giải", placeholder: "Nêu rõ nội dung chứng từ", multiline: true },
    { kind: "text", key: "amount", label: "Số tiền", placeholder: "Ví dụ: 1000000", keyboardType: "decimal-pad" as const }
  ];
  const title = module === "receivables" ? "Tạo phiếu thu nháp" : module === "payables" ? "Tạo phiếu chi NCC nháp" : "Tạo phiếu quỹ nháp";
  return <NativeWorkflowFormShell currentStep={review ? 1 : 0} description="Không ghi sổ khi ngoại tuyến. Trước khi xác nhận, máy chủ trả về tác động sổ phụ và cảnh báo hiện hành." steps={commerceSteps} title={title}><NativeModuleActionForm fields={fields} values={values} onChange={update} onReview={() => void requestReview()} review={review} onConfirm={() => void confirm()} confirmLabel="Xác nhận tạo phiếu nháp" pending={pending} notice={notice} reviewLabel="Rà soát hậu quả tài chính" /></NativeWorkflowFormShell>;
}

function WorkforceWorkflow({ catalog, onCompleted, payload, session }: { catalog?: CatalogPayload; onCompleted: () => Promise<void>; payload: ModulePayload; session: MobileSession }) {
  type Values = { action: string; employeeId: string; productUnitId: string; actualQuantity: string; totalAmount: string; workOrderId: string };
  const workOrders = recordsForModule("workforce", payload);
  const [values, setValues] = useState<Values>({ action: "create", employeeId: "", productUnitId: "", actualQuantity: "", totalAmount: "", workOrderId: "" });
  const [review, setReview] = useState<NativeReviewSummary>();
  const [notice, setNotice] = useState<NativeWorkflowNotice>();
  const [pending, setPending] = useState(false);
  const update = (key: keyof Values, value: string) => { setReview(undefined); setNotice(undefined); setValues((current) => ({ ...current, [key]: value })); };
  const selected = workOrders.find((order) => order.id === values.workOrderId);
  const build = (): Record<string, unknown> | undefined => {
    if (values.action === "create") {
      const quantity = numberValue(values.actualQuantity); const totalAmount = numberValue(values.totalAmount);
      if (!values.employeeId || !values.productUnitId || quantity === undefined || quantity <= 0 || totalAmount === undefined || totalAmount < 0) { setNotice({ status: "error", title: "Thiếu dữ liệu phiếu công", message: "Chọn nhân sự, vật tư, sản lượng và tổng tiền công hợp lệ." }); return undefined; }
      return { action: "createWorkOrderDraft", employeeId: values.employeeId, productUnitId: values.productUnitId, actualQuantity: quantity, totalAmount };
    }
    const expectedVersion = typeof selected?.version === "number" ? selected.version : undefined;
    if (!values.workOrderId || !expectedVersion) { setNotice({ status: "error", title: "Chưa chọn phiếu công", message: "Chọn phiếu công có phiên bản hiện hành trước khi duyệt hoặc ghi bảng công." }); return undefined; }
    return { action: values.action === "approve" ? "approveOutput" : "postCompensation", workOrderId: values.workOrderId, expectedVersion };
  };
  const requestReview = async () => {
    const body = build(); if (!body) return;
    setPending(true);
    try { const result = await nativeErpPost<{ review?: Record<string, unknown> }>(session, "/api/mobile/workforce", { ...body, review: true }); setReview(toReviewSummary(result.review, "Rà soát phiếu công")); }
    catch (cause) { setNotice({ status: "error", title: "Chưa thể rà soát", message: errorMessage(cause) }); }
    finally { setPending(false); }
  };
  const confirm = async () => {
    const body = build(); if (!body) return;
    setPending(true);
    try { const result = await nativeErpPost<{ summary?: string }>(session, "/api/mobile/workforce", { ...body, confirm: true, idempotencyKey: createNativeIdempotencyKey("mobile-workforce") }); setNotice({ status: "success", title: "Đã gửi phiếu công", message: result.summary ?? "Máy chủ đã xử lý phiếu công." }); setReview(undefined); await onCompleted(); }
    catch (cause) { setNotice({ status: "error", title: "Chưa thể xử lý phiếu công", message: errorMessage(cause) }); }
    finally { setPending(false); }
  };
  const fields: NativeActionField<Values>[] = [
    { kind: "select", key: "action", label: "Thao tác", options: [{ value: "create", label: "Tạo phiếu công nháp" }, { value: "approve", label: "Duyệt sản lượng" }, { value: "post", label: "Ghi bảng công" }] },
    ...(values.action === "create" ? [
      { kind: "select" as const, key: "employeeId" as const, label: "Nhân sự", options: itemOptions(catalog?.employees, "Nhân sự") },
      { kind: "select" as const, key: "productUnitId" as const, label: "Vật tư / đầu việc", options: productSelectOptions(catalog?.products) },
      { kind: "text" as const, key: "actualQuantity" as const, label: "Sản lượng", placeholder: "Ví dụ: 10", keyboardType: "decimal-pad" as const },
      { kind: "text" as const, key: "totalAmount" as const, label: "Tổng tiền công", placeholder: "Ví dụ: 500000", keyboardType: "decimal-pad" as const }
    ] : [{ kind: "select" as const, key: "workOrderId" as const, label: "Phiếu công", options: workOrders.filter((item) => typeof item.id === "string").map((item) => ({ value: String(item.id), label: `${stringValue(item.documentNo, "Phiếu công")} · ${stringValue(item.status)}` })) }])
  ];
  return <NativeWorkflowFormShell currentStep={review ? 1 : 0} description="Chỉ sản lượng đã duyệt mới có thể tạo tiền công. Máy chủ chặn tính trùng và kiểm tra phiên bản phiếu công." steps={commerceSteps} title="Nhân công: sản lượng và tiền công"><NativeModuleActionForm fields={fields} values={values} onChange={update} onReview={() => void requestReview()} review={review} onConfirm={() => void confirm()} confirmLabel="Xác nhận thao tác nhân công" pending={pending} notice={notice} reviewLabel="Rà soát phiếu công" /></NativeWorkflowFormShell>;
}

function ImportWorkflow({ onCompleted, session }: { onCompleted: () => Promise<void>; session: MobileSession }) {
  const [fileName, setFileName] = useState("");
  const [review, setReview] = useState<NativeReviewSummary>();
  const [notice, setNotice] = useState<NativeWorkflowNotice>();
  const [pending, setPending] = useState(false);
  const pickAndDryRun = async () => {
    setNotice(undefined); setReview(undefined);
    const result = await DocumentPicker.getDocumentAsync({ type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setFileName(asset.name);
    setPending(true);
    try {
      const formData = new FormData();
      formData.append("workbook", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as unknown as Blob);
      const uploaded = await nativeErpUpload<{ review?: Record<string, unknown> }>(session, "/api/mobile/import", formData);
      setReview(toReviewSummary(uploaded.review, "Kết quả chạy thử Excel"));
      setNotice({ status: "success", title: "Đã chạy thử workbook", message: "Chưa có dữ liệu nào được post từ file Excel. Hãy xem danh sách lỗi bên dưới." });
      await onCompleted();
    } catch (cause) { setNotice({ status: "error", title: "Chưa thể chạy thử import", message: errorMessage(cause) }); }
    finally { setPending(false); }
  };
  return <NativeWorkflowFormShell currentStep={review ? 1 : 0} description="Chỉ nhận .xlsx tối đa 40 MB. Chạy thử chỉ tạo job và issue để đối soát, không bulk-post dữ liệu tài chính hay kho." steps={[{ id: "file", label: "Chọn file" }, { id: "dry-run", label: "Chạy thử" }, { id: "issues", label: "Xử lý lỗi" }]} title="Import Excel an toàn"><View style={styles.importCard}>{fileName ? <Text style={styles.importFile}>Đã chọn: {fileName}</Text> : <Text style={styles.importHint}>Chọn workbook .xlsx từ thiết bị để bắt đầu chạy thử.</Text>}{review ? <NativeReviewConfirmationCard review={review} confirmLabel="Đã hiểu, xem lỗi import" onConfirm={() => setReview(undefined)} pending={false} /> : <AppButton label="Chọn file và chạy thử" onPress={() => void pickAndDryRun()} pending={pending} />}{notice ? <NativeWorkflowNoticeCard notice={notice} /> : null}</View></NativeWorkflowFormShell>;
}

function AdminWorkflow({ onCompleted, payload, session }: { onCompleted: () => Promise<void>; payload: ModulePayload; session: MobileSession }) {
  type Values = { action: string; userId: string; email: string; role: string; status: string; moduleIds: string; newPassword: string; reauthPassword: string };
  const users = recordsForModule("admin", payload);
  const firstUser = users.find((user) => typeof user.id === "string");
  const [values, setValues] = useState<Values>({ action: "updateAccess", userId: typeof firstUser?.id === "string" ? firstUser.id : "", email: "", role: stringValue(firstUser?.role, "viewer"), status: stringValue(firstUser?.status, "active"), moduleIds: arrayStrings(firstUser?.moduleIds).join(","), newPassword: "", reauthPassword: "" });
  const [review, setReview] = useState<NativeReviewSummary>();
  const [notice, setNotice] = useState<NativeWorkflowNotice>();
  const [pending, setPending] = useState(false);
  const selected = users.find((user) => user.id === values.userId);
  const update = (key: keyof Values, value: string) => {
    setReview(undefined); setNotice(undefined);
    if (key === "userId") {
      const target = users.find((user) => user.id === value);
      setValues((current) => ({ ...current, userId: value, role: stringValue(target?.role, "viewer"), status: stringValue(target?.status, "active"), moduleIds: arrayStrings(target?.moduleIds).join(",") }));
      return;
    }
    if (key === "action" && value === "invite") {
      setValues((current) => ({ ...current, action: value, role: inviteRoleOptions.some((option) => option.value === current.role) ? current.role : "viewer", status: "invited", newPassword: "" }));
      return;
    }
    setValues((current) => ({ ...current, [key]: value }));
  };
  const build = (): Record<string, unknown> | undefined => {
    const expectedSessionVersion = typeof selected?.sessionVersion === "number" ? selected.sessionVersion : undefined;
    if (values.reauthPassword.length < 12) { setNotice({ status: "error", title: "Cần xác nhận lại danh tính", message: "Nhập lại mật khẩu quản trị tối thiểu 12 ký tự trước khi thay đổi tài khoản." }); return undefined; }
    const moduleIds = values.moduleIds.split(",").map((value) => value.trim()).filter(Boolean);
    if (!moduleIds.length) { setNotice({ status: "error", title: "Thiếu phạm vi module", message: "Nhập ít nhất một module được cấp quyền, cách nhau bằng dấu phẩy." }); return undefined; }
    if (values.action === "invite") {
      const email = values.email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) { setNotice({ status: "error", title: "Email chưa hợp lệ", message: "Nhập email công việc hợp lệ để gửi lời mời tài khoản nội bộ." }); return undefined; }
      if (!inviteRoleOptions.some((option) => option.value === values.role)) { setNotice({ status: "error", title: "Vai trò chưa hợp lệ", message: "Lời mời native chỉ cấp các vai trò nội bộ an toàn. Vai trò Chủ cửa hàng và Quản trị viên phải được xử lý theo quy trình quản trị riêng." }); return undefined; }
      if (typeof payload.revision !== "number") { setNotice({ status: "error", title: "Cần tải lại dữ liệu", message: "Không lấy được phiên bản danh sách tài khoản để tạo lời mời an toàn. Vui lòng tải lại màn hình." }); return undefined; }
      return { action: "invite", email, role: values.role, moduleIds, expectedRevision: payload.revision, reauthPassword: values.reauthPassword };
    }
    if (!values.userId || expectedSessionVersion === undefined) { setNotice({ status: "error", title: "Cần chọn tài khoản", message: "Chọn tài khoản hiện hành để máy chủ kiểm tra phiên bản trước khi cập nhật." }); return undefined; }
    if (values.action === "resetPassword") {
      if (values.newPassword.length < 12) { setNotice({ status: "error", title: "Mật khẩu mới chưa hợp lệ", message: "Mật khẩu mới cần tối thiểu 12 ký tự." }); return undefined; }
      return { action: "resetPassword", userId: values.userId, expectedSessionVersion, password: values.newPassword, reauthPassword: values.reauthPassword };
    }
    return { action: "updateAccess", userId: values.userId, expectedSessionVersion, role: values.role, status: values.status, moduleIds, reauthPassword: values.reauthPassword };
  };
  const requestReview = () => {
    const body = build(); if (!body) return;
    if (values.action === "invite") {
      setReview({ title: "Rà soát lời mời tài khoản", description: "Máy chủ sẽ tạo lời mời nội bộ theo phạm vi bên dưới sau khi kiểm tra lại danh tính quản trị viên và phiên bản danh sách tài khoản.", lines: [{ label: "Email nhận lời mời", value: values.email.trim().toLowerCase() }, { label: "Vai trò nội bộ", value: values.role, emphasis: "warning" }, { label: "Module được cấp", value: values.moduleIds }], warnings: ["Ứng dụng không hiển thị token hoặc mật khẩu. Người được mời kích hoạt tài khoản theo luồng do máy chủ quản lý."] });
      return;
    }
    setReview({ title: values.action === "resetPassword" ? "Rà soát đặt lại mật khẩu" : "Rà soát quyền truy cập", description: "Yêu cầu này bắt buộc xác nhận lại mật khẩu quản trị. Máy chủ kiểm tra session version trước khi cập nhật.", lines: [{ label: "Tài khoản", value: stringValue(selected?.username ?? selected?.email ?? selected?.id, values.userId) }, { label: "Thao tác", value: values.action === "resetPassword" ? "Đặt lại mật khẩu" : `Vai trò ${values.role} · ${values.status}`, emphasis: "warning" }], warnings: ["Mật khẩu mới không được hiển thị trong bước rà soát."] });
  };
  const confirm = async () => {
    const body = build(); if (!body) return;
    setPending(true);
    try { const result = await nativeErpPost<{ summary?: string }>(session, "/api/mobile/admin", { ...body, idempotencyKey: createNativeIdempotencyKey("mobile-admin") }); setNotice({ status: "success", title: values.action === "invite" ? "Đã tạo lời mời tài khoản" : "Đã cập nhật tài khoản", message: result.summary ?? (values.action === "invite" ? "Máy chủ đã tạo lời mời tài khoản nội bộ." : "Máy chủ đã cập nhật tài khoản.") }); setReview(undefined); setValues((current) => ({ ...current, email: current.action === "invite" ? "" : current.email, newPassword: "", reauthPassword: "" })); await onCompleted(); }
    catch (cause) { setNotice({ status: "error", title: values.action === "invite" ? "Chưa thể tạo lời mời" : "Chưa thể cập nhật tài khoản", message: errorMessage(cause) }); }
    finally { setPending(false); }
  };
  const userOptions = users.filter((user) => typeof user.id === "string").map((user) => ({ value: String(user.id), label: stringValue(user.username ?? user.email ?? user.id) }));
  const fields: NativeActionField<Values>[] = [
    { kind: "select", key: "action", label: "Thao tác quản trị", options: [{ value: "updateAccess", label: "Cập nhật vai trò và module" }, { value: "resetPassword", label: "Đặt lại mật khẩu" }, { value: "invite", label: "Mời tài khoản nội bộ" }] },
    ...(values.action === "invite" ? [{ kind: "text" as const, key: "email" as const, label: "Email công việc", placeholder: "ten@congty.vn", keyboardType: "email-address" as const, autoCapitalize: "none" as const, helperText: "Chỉ mời nhân sự nội bộ. Không dùng màn này cho khách hàng, nhà cung cấp, tài xế hoặc thợ." }] : [{ kind: "select" as const, key: "userId" as const, label: "Tài khoản", options: userOptions }]),
    ...(values.action === "updateAccess" ? [
      { kind: "select" as const, key: "role" as const, label: "Vai trò", options: roleOptions },
      { kind: "select" as const, key: "status" as const, label: "Trạng thái", options: [{ value: "active", label: "Đang hoạt động" }, { value: "invited", label: "Đã mời" }, { value: "disabled", label: "Đã khóa" }] },
      { kind: "text" as const, key: "moduleIds" as const, label: "Module được cấp", helperText: "Nhập mã module cách nhau bằng dấu phẩy, ví dụ: sales,delivery.", placeholder: "sales,delivery" }
    ] : values.action === "invite" ? [
      { kind: "select" as const, key: "role" as const, label: "Vai trò nội bộ", options: inviteRoleOptions, helperText: "Không cấp vai trò Chủ cửa hàng hoặc Quản trị viên qua lời mời trên điện thoại." },
      { kind: "text" as const, key: "moduleIds" as const, label: "Module được cấp", helperText: "Nhập mã module cách nhau bằng dấu phẩy, ví dụ: sales,delivery.", placeholder: "sales,delivery" }
    ] : [{ kind: "text" as const, key: "newPassword" as const, label: "Mật khẩu mới", placeholder: "Tối thiểu 12 ký tự", secureTextEntry: true }]),
    { kind: "text", key: "reauthPassword", label: "Nhập lại mật khẩu quản trị", placeholder: "Tối thiểu 12 ký tự", secureTextEntry: true, helperText: values.action === "invite" ? "Bắt buộc trước khi gửi lời mời nội bộ." : "Bắt buộc trước khi thay đổi quyền hoặc mật khẩu." }
  ];
  return <NativeWorkflowFormShell currentStep={review ? 1 : 0} description="Quyền, mật khẩu và lời mời không được xử lý bằng session cũ. Máy chủ kiểm tra lại danh tính quản trị viên và phiên bản dữ liệu trước khi ghi nhận." steps={commerceSteps} title="Quản trị tài khoản"><NativeModuleActionForm disabled={values.action !== "invite" && !users.length} fields={fields} values={values} onChange={update} onReview={requestReview} review={review} onConfirm={() => void confirm()} confirmLabel={values.action === "invite" ? "Xác nhận gửi lời mời" : "Xác nhận cập nhật tài khoản"} pending={pending} notice={notice ?? (values.action !== "invite" && !users.length ? { status: "empty", title: "Chưa có tài khoản để quản trị", message: "Bạn vẫn có thể chọn “Mời tài khoản nội bộ” để tạo lời mời mới." } : undefined)} reviewLabel={values.action === "invite" ? "Rà soát lời mời tài khoản" : "Rà soát thay đổi quyền"} /></NativeWorkflowFormShell>;
}

function UnavailableWorkflow({ message, title }: { message: string; title: string }) {
  return <NativeWorkflowFormShell currentStep={0} description="Ứng dụng native chỉ hiển thị thao tác khi đã có hợp đồng API giới hạn miền và kiểm soát an toàn tương ứng." steps={[{ id: "available", label: "Đang sử dụng dữ liệu an toàn" }, { id: "future", label: "Chờ route chuyên biệt" }]} title={title}><NativeWorkflowNoticeCard notice={{ status: "empty", title, message }} /></NativeWorkflowFormShell>;
}

function NativeRecordCard({ module, record, revision, theme, pendingAction, onDocumentAction, onContextAction, onFinancialAction }: { module: ModuleId; record: Record<string, unknown>; revision?: number; theme: ReturnType<typeof useAppTheme>; pendingAction?: string; onDocumentAction: (path: string, action: "confirm" | "allocate", version: number, label: string) => Promise<void>; onContextAction: (path: string, body: Record<string, unknown>, label: string) => Promise<void>; onFinancialAction: (path: string, body: Record<string, unknown>) => Promise<void> }) {
  const title = stringValue(record.documentNo ?? record.fileName ?? record.displayName ?? record.name ?? record.id, "Chứng từ");
  const status = stringValue(record.status ?? record.action ?? "Đang theo dõi");
  const detail = record.customer ?? record.supplier ?? record.summary ?? record.description ?? record.message;
  const version = typeof record.version === "number" ? record.version : undefined;
  const id = typeof record.id === "string" ? record.id : undefined;
  const isSales = module === "sales" && id && version !== undefined && (record.status === "draft" || record.status === "confirmed");
  const isProcurement = module === "procurement" && id && version !== undefined && record.status === "draft";
  const deliveryAction = module === "delivery" && id && (record.status === "assigned" || record.status === "loading") ? record.status === "assigned" ? "start_loading" : "dispatch" : undefined;
  const isImportIssue = module === "import" && id && record.status === "open" && typeof revision === "number";
  const financialAction = id && record.status === "draft"
    ? module === "receivables" ? { path: "/api/mobile/receivables", action: "confirmPayment", body: { action: "confirmPayment", paymentId: id }, label: "Rà soát và xác nhận phiếu thu" }
      : module === "payables" ? { path: "/api/mobile/payables", action: "confirmPayment", body: { action: "confirmPayment", paymentId: id }, label: "Rà soát và xác nhận phiếu chi" }
        : module === "cash" ? { path: "/api/mobile/cash", action: "confirmVoucher", body: { action: "confirmVoucher", voucherId: id }, label: "Rà soát và xác nhận phiếu quỹ" }
          : undefined
    : undefined;
  const workforceAction = module === "workforce" && id && version !== undefined && (record.status === "draft" || record.status === "approved")
    ? { path: "/api/mobile/workforce", action: record.status === "draft" ? "approveOutput" : "postCompensation", body: { action: record.status === "draft" ? "approveOutput" : "postCompensation", workOrderId: id, expectedVersion: version }, label: record.status === "draft" ? "Rà soát và duyệt sản lượng" : "Rà soát và ghi bảng công" }
    : undefined;
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.cardHeader}><Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text><StatusChip label={status} tone={/reversed|failed|error|warning/i.test(status) ? "warning" : "neutral"} /></View>
    {detail ? <Text style={[styles.cardDetail, { color: theme.textMuted }]}>{stringValue(detail)}</Text> : null}
    {typeof record.promisedDeliveryDate === "string" ? <Text style={[styles.cardMeta, { color: theme.textMuted }]}>Ngày giao dự kiến: {record.promisedDeliveryDate}</Text> : null}
    {typeof record.rowCount === "number" ? <Text style={[styles.cardMeta, { color: theme.textMuted }]}>Dòng kiểm tra: {record.rowCount} · Vấn đề: {stringValue(record.issueCount)}</Text> : null}
    {isSales ? <View style={styles.actionRow}>{record.status === "draft" ? <AppButton label="Xem lại và xác nhận" pending={pendingAction === `/api/mobile/sales/${id}:confirm`} onPress={() => void onDocumentAction(`/api/mobile/sales/${id}`, "confirm", version, "Xác nhận đơn bán sẽ khóa ảnh chụp giá và điều khoản.")} style={styles.action} /> : <AppButton label="Phân bổ nguồn hàng" pending={pendingAction === `/api/mobile/sales/${id}:allocate`} onPress={() => void onDocumentAction(`/api/mobile/sales/${id}`, "allocate", version, "Phân bổ nguồn chỉ dùng dữ liệu kho và chứng từ hiện tại.")} style={styles.action} />}</View> : null}
    {isProcurement ? <View style={styles.actionRow}><AppButton label="Xem lại và xác nhận" pending={pendingAction === `/api/mobile/procurement/${id}:confirm`} onPress={() => void onDocumentAction(`/api/mobile/procurement/${id}`, "confirm", version, "Xác nhận phiếu mua sẽ khóa ảnh chụp điều khoản hiện tại.")} style={styles.action} /></View> : null}
    {deliveryAction && id ? <View style={styles.actionRow}><AppButton label={deliveryAction === "start_loading" ? "Bắt đầu bốc hàng" : "Xuất phát giao hàng"} pending={pendingAction === "/api/mobile/delivery/workflow:" + deliveryAction} onPress={() => void onContextAction("/api/mobile/delivery/workflow", { action: deliveryAction, deliveryJobId: id }, deliveryAction === "start_loading" ? "Bắt đầu bốc hàng cho chuyến đã phân công." : "Chuyển chuyến sang đang giao. GPS chỉ được bật khi chuyến đang giao.")} style={styles.action} /></View> : null}
    {isImportIssue && id && revision ? <View style={styles.actionRow}><AppButton label="Đánh dấu đã xử lý" pending={pendingAction === "/api/mobile/import/" + id + ":resolveIssue"} onPress={() => void onContextAction(`/api/mobile/import/${id}`, { action: "resolveIssue", expectedRevision: revision }, "Đánh dấu lỗi import đã được xử lý, không post dữ liệu từ workbook.")} style={styles.action} /><AppButton label="Bỏ qua lỗi này" tone="secondary" onPress={() => void onContextAction(`/api/mobile/import/${id}`, { action: "ignoreIssue", expectedRevision: revision }, "Bỏ qua lỗi import này. Hệ thống vẫn không post dữ liệu workbook.")} style={styles.action} /></View> : null}
    {financialAction ? <View style={styles.actionRow}><AppButton label={financialAction.label} pending={pendingAction === financialAction.path + ":" + financialAction.action} onPress={() => void onFinancialAction(financialAction.path, financialAction.body)} style={styles.action} /></View> : null}
    {workforceAction ? <View style={styles.actionRow}><AppButton label={workforceAction.label} pending={pendingAction === workforceAction.path + ":" + workforceAction.action} onPress={() => void onFinancialAction(workforceAction.path, workforceAction.body)} style={styles.action} /></View> : null}
  </View>;
}

function moduleNeedsCatalog(module: ModuleId) { return ["sales", "procurement", "inventory", "receivables", "payables", "cash", "workforce"].includes(module); }
function recordsForModule(module: ModuleId, payload: ModulePayload): Record<string, unknown>[] {
  const keys: Record<ModuleId, string[]> = {
    catalog: ["products", "warehouses", "employees", "customers", "suppliers"], sales: ["orders"], procurement: ["purchaseOrders", "orders"], inventory: ["alerts", "stock", "movements", "receiptLines", "approvalRequests"], delivery: ["jobs", "deliveries", "approvalRequests"], receivables: ["payments", "obligations", "summaries", "collectionQueue"], payables: ["payments", "obligations", "summaries"], cash: ["vouchers", "accounts", "bankTransferProofs"], workforce: ["workOrders", "compensationBatches", "advances"], import: ["jobs", "issues"], audit: ["logs"], reporting: [], admin: ["users"]
  };
  for (const key of keys[module]) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}
function itemOptions(items: CatalogItem[] | undefined, fallback: string) { return (items ?? []).filter((item) => item.status !== "disabled").map((item) => ({ value: item.id, label: item.displayName ?? item.name ?? item.id, description: item.code ?? item.productCode })); }
function productSelectOptions(items: CatalogItem[] | undefined) { return (items ?? []).filter((item) => item.status !== "disabled").map((item) => ({ value: item.id, label: `${item.productCode ?? "VT"} · ${item.productName ?? item.displayName ?? item.id}`, description: item.unitName ? `Đơn vị: ${item.unitName}` : undefined })); }
function warehouseOptions(items: CatalogItem[] | undefined) { return (items ?? []).map((item) => ({ value: item.id, label: item.name ?? item.displayName ?? item.id, description: item.code })); }
function arrayStrings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function numberValue(value: string) { if (!value.trim()) return undefined; const parsed = Number(value.replace(/,/g, "").trim()); return Number.isFinite(parsed) ? parsed : undefined; }
function optionalNumber(value: string) { return value.trim() ? numberValue(value) : undefined; }
function optionalInteger(value: string) { const parsed = optionalNumber(value); return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined; }
function optionalText(value: string) { return value.trim() || undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown, fallback = "-") { return typeof value === "string" || typeof value === "number" ? String(value) : fallback; }
function money(value: unknown) { return typeof value === "number" ? `${new Intl.NumberFormat("vi-VN").format(value)} đ` : "-"; }
function reviewText(review: Record<string, unknown>) { const summary = toReviewSummary(review, "Kiểm tra hậu quả trước khi ghi sổ."); return [summary.title, summary.description, ...summary.lines.map((line) => `${line.label}: ${line.value}`), ...(summary.warnings ?? [])].filter(Boolean).join("\n\n"); }
function toReviewSummary(review: unknown, fallback: string): NativeReviewSummary {
  const source = isRecord(review) ? review : {};
  const lines = Object.entries(source).filter(([key, value]) => !["title", "description", "warnings", "ledgerEffects", "effects"].includes(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).slice(0, 6).map(([label, value]) => ({ label: reviewLabel(label), value: typeof value === "number" && /amount|total|net|gross|balance|price|cost/i.test(label) ? money(value) : String(value), emphasis: /amount|total|status/i.test(label) ? "strong" as const : "normal" as const }));
  const effects = Array.isArray(source.ledgerEffects) ? source.ledgerEffects.filter((item): item is string => typeof item === "string") : Array.isArray(source.effects) ? source.effects.filter((item): item is string => typeof item === "string") : [];
  return { title: stringValue(source.title, fallback), description: typeof source.description === "string" ? source.description : undefined, lines: lines.length ? lines : [{ label: "Trạng thái", value: "Máy chủ đã kiểm tra dữ liệu hiện hành.", emphasis: "strong" }], warnings: [...effects, ...(Array.isArray(source.warnings) ? source.warnings.filter((item): item is string => typeof item === "string") : [])] };
}
function reviewLabel(key: string) { return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()); }
function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : "Không thể thực hiện thao tác. Vui lòng thử lại."; }
const roleOptions = ["owner", "administrator", "accountant", "sales", "warehouse", "dispatcher", "driver", "worker", "supervisor", "viewer", "customer", "supplier"].map((role) => ({ value: role, label: role }));
const inviteRoleOptions = ["accountant", "sales", "warehouse", "dispatcher", "supervisor", "viewer"].map((role) => ({ value: role, label: role }));
function reportSummary(value: unknown) { if (!isRecord(value) || !isRecord(value.summary)) return undefined; const summary = value.summary; return [{ label: "Doanh thu trước VAT", value: money(summary.salesNet) }, { label: "Lãi gộp", value: money(summary.grossProfit) }, { label: "Đã thu", value: money(summary.customerCredit) }, { label: "Đã chi quỹ", value: money(summary.cashOut) }]; }

const styles = StyleSheet.create({
  directory: { flexGrow: 1, padding: 20, paddingBottom: 36 },
  directoryGrid: { gap: 12, marginTop: 22 },
  directoryCard: { borderRadius: 18, borderWidth: 1, minHeight: 112, padding: 17 },
  directoryPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  directoryCopy: { flex: 1 },
  directoryTitle: { fontSize: 19, fontWeight: "800", lineHeight: 25 },
  directoryDescription: { fontSize: 16, lineHeight: 23, marginTop: 5 },
  directoryOpen: { fontSize: 16, fontWeight: "800", marginTop: 12 },
  directoryBack: { alignSelf: "flex-start", minHeight: 48 },
  root: { flex: 1 }, header: { borderBottomWidth: 1, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16 }, eyebrow: { fontSize: 14, fontWeight: "800", textTransform: "uppercase" }, title: { fontSize: 27, fontWeight: "900", marginTop: 4 }, subtitle: { fontSize: 16, lineHeight: 23, marginTop: 7 }, moduleScroller: { flexGrow: 0, borderBottomWidth: 1 }, moduleRail: { gap: 9, paddingHorizontal: 18, paddingVertical: 12 }, moduleButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 }, moduleText: { fontSize: 16, fontWeight: "800" }, content: { gap: 14, padding: 18, paddingBottom: 46 }, moduleHeading: { borderRadius: 18, borderWidth: 1, gap: 7, padding: 18 }, moduleTitle: { fontSize: 23, fontWeight: "900" }, moduleDescription: { fontSize: 16, lineHeight: 23 }, loading: { alignItems: "center", gap: 11, paddingVertical: 38 }, loadingText: { fontSize: 16 }, stack: { gap: 12 }, empty: { borderRadius: 18, borderWidth: 1, gap: 7, padding: 20 }, emptyTitle: { fontSize: 19, fontWeight: "800" }, emptyText: { fontSize: 16, lineHeight: 23 }, card: { borderRadius: 18, borderWidth: 1, gap: 8, padding: 16 }, cardHeader: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" }, cardTitle: { flex: 1, fontSize: 18, fontWeight: "900", lineHeight: 24 }, cardDetail: { fontSize: 16, lineHeight: 23 }, cardMeta: { fontSize: 15, lineHeight: 22 }, actionRow: { gap: 10, marginTop: 5 }, action: { alignSelf: "stretch" }, metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metric: { borderRadius: 16, borderWidth: 1, flexBasis: "47%", flexGrow: 1, gap: 7, minHeight: 112, padding: 15 }, metricLabel: { fontSize: 15, fontWeight: "700", lineHeight: 21 }, metricValue: { fontSize: 20, fontWeight: "900", lineHeight: 27 }, notice: { borderRadius: 16, borderWidth: 1, gap: 5, padding: 15 }, noticeTitle: { fontSize: 17, fontWeight: "900" }, noticeText: { fontSize: 16, lineHeight: 23 }, importCard: { gap: 14 }, importFile: { fontSize: 16, fontWeight: "800" }, importHint: { fontSize: 16, lineHeight: 23 }
});
