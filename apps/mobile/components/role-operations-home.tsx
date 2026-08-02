import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  claimMobileWorkOrder,
  confirmMobileDeliveryReceipt,
  createMobileCustomerOrder,
  getMobileCustomerCatalog,
  getMobilePortalOverview,
  MobileApiError,
  type MobileCatalogItem,
  type MobilePortalOverview,
  submitMobileCustomerPaymentProof,
  submitMobileDeliveryCompletion,
  submitMobileSupplierDeliveryNotice,
  submitMobileSupplierResponse
} from "../lib/api";
import type { MobileSession } from "../lib/session";
import { AppButton, StateMessage, StatusChip } from "./mobile-ui";
import { useAppTheme } from "../lib/ui";
import { findDeliveryForWorkOrder } from "../lib/work-order-detail";
import { registerMobileForegroundRefresh } from "../lib/mobile-lifecycle";

export type NativeRoleSurface = Readonly<{
  canShowOwnOrderPrice: boolean;
  canShowSupplierAgreedPrice: boolean;
  canOpenInAppMap: boolean;
  canEditDeliveredQuantity: false;
  canShowInternalStock: false;
  canShowCostOrMargin: false;
}>;

export function nativeRoleSurface(role: string): NativeRoleSurface {
  return {
    canShowOwnOrderPrice: role === "customer",
    canShowSupplierAgreedPrice: role === "supplier",
    canOpenInAppMap: role === "worker" || role === "driver" || role === "dispatcher",
    canEditDeliveredQuantity: false,
    canShowInternalStock: false,
    canShowCostOrMargin: false
  };
}

export function RoleOperationsHome({ session }: { session: MobileSession }) {
  const theme = useAppTheme();
  const router = useRouter();
  const surface = nativeRoleSurface(session.user.role);
  const [overview, setOverview] = useState<MobilePortalOverview>();
  const [catalog, setCatalog] = useState<MobileCatalogItem[]>([]);
  const [error, setError] = useState<string>();
  const [catalogError, setCatalogError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [address, setAddress] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [productIndex, setProductIndex] = useState(0);
  const [orderKey, setOrderKey] = useState(() => idempotencyKey("customer-order"));
  const [recipientName, setRecipientName] = useState("");
  const [deliveryEvidence, setDeliveryEvidence] = useState("");
  const [selectedCustomerOrderId, setSelectedCustomerOrderId] = useState<string>();
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<string>();
  const [selectedDriverDeliveryId, setSelectedDriverDeliveryId] = useState<string>();

  const refresh = useCallback(async () => {
    setError(undefined);
    setCatalogError(undefined);
    try {
      const next = await getMobilePortalOverview(session.accessToken);
      setOverview(next);
      if (session.user.role === "customer") {
        try {
          setCatalog(await getMobileCustomerCatalog(session.accessToken));
        } catch (cause) {
          setCatalog([]);
          setCatalogError(messageOf(cause));
        }
      } else {
        setCatalog([]);
      }
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [session.accessToken, session.user.role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => registerMobileForegroundRefresh(refresh), [refresh]);

  const selectedProduct = catalog[productIndex % Math.max(catalog.length, 1)];
  const customerBalance = useMemo(() => balanceOf(overview?.state.customerLedgerEntries ?? []), [overview]);
  const supplierBalance = useMemo(() => balanceOf(overview?.state.supplierLedgerEntries ?? []), [overview]);

  const createOrder = async () => {
    if (!selectedProduct) return;
    if (address.trim().length < 8) {
      Alert.alert("Thiếu địa chỉ giao hàng", "Nhập địa chỉ giao hàng rõ ràng trước khi tạo đơn nháp.");
      return;
    }
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      Alert.alert("Số lượng chưa hợp lệ", "Nhập số lượng lớn hơn 0.");
      return;
    }
    setPending("customer-order");
    try {
      const result = await createMobileCustomerOrder(session.accessToken, {
        idempotencyKey: orderKey,
        deliveryAddress: address.trim(),
        paymentMethod: "transfer",
        lines: [{ productUnitId: selectedProduct.id, quantity: parsedQuantity }]
      });
      Alert.alert("Đã tạo đơn nháp", result.summary);
      setOrderKey(idempotencyKey("customer-order"));
      setAddress("");
      setQuantity("1");
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể tạo đơn", messageOf(cause));
    } finally {
      setPending(undefined);
    }
  };

  const confirmReceipt = async (deliveryJobId: string) => {
    const captured = await captureCameraImage("ảnh xác nhận nhận hàng");
    if (!captured) return;
    const form = new FormData();
    form.append("deliveryJobId", deliveryJobId);
    form.append("idempotencyKey", idempotencyKey("delivery-receipt"));
    form.append("receiptImage", captured as unknown as Blob);
    setPending(deliveryJobId);
    try {
      const result = await confirmMobileDeliveryReceipt(session.accessToken, form);
      Alert.alert("Đã gửi xác nhận", result.summary);
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể gửi ảnh", messageOf(cause));
    } finally {
      setPending(undefined);
    }
  };

  const submitPaymentProof = async (order: MobilePortalOverview["state"]["salesOrders"][number]) => {
    const captured = await captureCameraImage("minh chứng chuyển khoản");
    if (!captured) return;
    const amount = orderTotal(order);
    const form = new FormData();
    form.append("orderId", order.id);
    form.append("amount", String(amount));
    form.append("idempotencyKey", idempotencyKey("payment-proof"));
    form.append("attachment", captured as unknown as Blob);
    setPending(order.id);
    try {
      const result = await submitMobileCustomerPaymentProof(session.accessToken, form);
      Alert.alert("Đã gửi minh chứng", result.summary);
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể gửi minh chứng", messageOf(cause));
    } finally {
      setPending(undefined);
    }
  };

  const supplierResponse = async (purchaseOrderId: string, status: "available" | "unavailable") => {
    setPending(purchaseOrderId);
    try {
      const result = await submitMobileSupplierResponse(session.accessToken, {
        idempotencyKey: idempotencyKey(`supplier-${purchaseOrderId}`),
        purchaseOrderId,
        status
      });
      Alert.alert("Đã gửi phản hồi", result.summary);
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể gửi phản hồi", messageOf(cause));
    } finally {
      setPending(undefined);
    }
  };

  const submitSupplierNotice = async (purchaseOrderId: string) => {
    const captured = await captureCameraImage("chứng từ giao hàng", true);
    const form = new FormData();
    form.append("purchaseOrderId", purchaseOrderId);
    form.append("idempotencyKey", idempotencyKey(`supplier-notice-${purchaseOrderId}`));
    form.append("note", "Nhà cung cấp thông báo đã giao; cửa hàng cần đối chiếu thực nhận.");
    if (captured) form.append("attachment", captured as unknown as Blob);
    setPending(purchaseOrderId);
    try {
      const result = await submitMobileSupplierDeliveryNotice(session.accessToken, form);
      Alert.alert("Đã gửi thông báo giao", result.summary);
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể gửi thông báo giao", messageOf(cause));
    } finally {
      setPending(undefined);
    }
  };

  const submitDeliveryCompletion = async (deliveryJobId: string) => {
    if (recipientName.trim().length < 2 || deliveryEvidence.trim().length < 5) {
      Alert.alert("Thiếu thông tin xác nhận", "Nhập tên người nhận và mô tả bằng chứng trước khi chụp ảnh giao hàng.");
      return;
    }
    const captured = await captureCameraImage("ảnh xác nhận đã giao");
    if (!captured) return;
    const form = new FormData();
    form.append("deliveryJobId", deliveryJobId);
    form.append("idempotencyKey", idempotencyKey("delivery-completion"));
    form.append("recipientName", recipientName.trim());
    form.append("evidence", deliveryEvidence.trim());
    form.append("completionImage", captured as unknown as Blob);
    setPending(deliveryJobId);
    try {
      const result = await submitMobileDeliveryCompletion(session.accessToken, form);
      Alert.alert("Đã gửi chờ duyệt", result.summary);
      setRecipientName("");
      setDeliveryEvidence("");
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể gửi xác nhận", messageOf(cause));
    } finally {
      setPending(undefined);
    }
  };

  const claimWork = async (workOrderId: string, expectedVersion?: number) => {
    setPending(workOrderId);
    try {
      const result = await claimMobileWorkOrder(session.accessToken, {
        idempotencyKey: idempotencyKey(`work-${workOrderId}`),
        workOrderId,
        expectedVersion
      });
      Alert.alert("Đã nhận việc", result.summary);
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể nhận việc", messageOf(cause));
    } finally {
      setPending(undefined);
    }
  };

  const openNativeTracking = () => router.push("/tracking");

  if (!overview && error) {
    return <StateMessage title="Chưa thể mở nghiệp vụ" message={error} actionLabel="Thử lại" onAction={() => void refresh()} />;
  }
  if (!overview) {
    return <StateMessage loading title="Đang tải nghiệp vụ" message="Đang kiểm tra quyền và dữ liệu được phân công cho bạn." />;
  }

  const selectedCustomerOrder = overview.state.salesOrders.find((order) => order.id === selectedCustomerOrderId) ?? overview.state.salesOrders[0];
  const selectedPurchaseOrder = overview.state.purchaseOrders.find((order) => order.id === selectedPurchaseOrderId) ?? overview.state.purchaseOrders[0];
  const selectedDriverDelivery = overview.state.deliveryJobs.find((job) => job.id === selectedDriverDeliveryId) ?? overview.state.deliveryJobs[0];

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.background }]}>
      <Text style={[styles.kicker, { color: theme.brand }]}>{roleHeading(session.user.role)}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{headlineForRole(session.user.role)}</Text>
      <Text style={[styles.copy, { color: theme.textMuted }]}>{copyForRole(session.user.role)}</Text>
      {error ? <InlineError message={error} onRetry={() => void refresh()} theme={theme} /> : null}

      {session.user.role === "customer" ? <>
        <SummaryCard label="Cần thanh toán" value={currency(customerBalance)} theme={theme} />
        <Text style={[styles.copy, { color: theme.textMuted }]}>{customerBalance > 0 ? "Hạn thanh toán: Xem trong tin nhắn của shop." : "Hiện bạn chưa cần thanh toán."}</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Đặt đơn mới</Text>
          <Text style={[styles.copy, { color: theme.textMuted }]}>Giá sẽ được shop xác nhận trước khi tạo đơn. Shop sẽ báo số tiền cần thanh toán sau khi duyệt.</Text>
          {catalogError ? <InlineError message={`Chưa tải được danh mục: ${catalogError}`} onRetry={() => void refresh()} theme={theme} /> : null}
          {selectedProduct ? <Pressable accessibilityRole="button" accessibilityLabel="Đổi vật tư" onPress={() => setProductIndex((value) => (value + 1) % catalog.length)} style={[styles.select, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}>
            <Text style={[styles.selectLabel, { color: theme.textMuted }]}>Vật tư đang chọn</Text>
            <Text style={[styles.selectValue, { color: theme.text }]}>{selectedProduct.productName} · {currency(selectedProduct.salePrice)}/{selectedProduct.unitName}</Text>
            <Text style={[styles.selectHint, { color: theme.brand }]}>Chạm để đổi vật tư</Text>
          </Pressable> : <Text style={[styles.empty, { color: theme.textMuted }]}>Chưa có vật tư đang bán để đặt qua ứng dụng.</Text>}
          <TextInput accessibilityLabel="Số lượng" keyboardType="decimal-pad" onChangeText={setQuantity} placeholder="Số lượng" placeholderTextColor={theme.textMuted} style={[styles.input, { borderColor: theme.border, color: theme.text }]} value={quantity} />
          <TextInput accessibilityLabel="Địa chỉ giao hàng" multiline onChangeText={setAddress} placeholder="Địa chỉ giao hàng" placeholderTextColor={theme.textMuted} style={[styles.input, styles.address, { borderColor: theme.border, color: theme.text }]} value={address} />
          <AppButton disabled={!selectedProduct} label="Tạo đơn nháp" onPress={() => void createOrder()} pending={pending === "customer-order"} style={styles.action} />
        </View>
        <Section title="Đơn của tôi" theme={theme}>
          <SelectableDocuments documents={overview.state.salesOrders.map((order) => ({ id: order.id, code: order.documentNo, state: order.status }))} selectedId={selectedCustomerOrder?.id} onSelect={setSelectedCustomerOrderId} theme={theme} />
          {selectedCustomerOrder ? <CustomerOrderDetail order={selectedCustomerOrder} canShowPrice={surface.canShowOwnOrderPrice} onPaymentProof={() => void submitPaymentProof(selectedCustomerOrder)} pending={pending === selectedCustomerOrder.id} theme={theme} /> : null}
        </Section>
        <Section title="Chuyến chờ xác nhận" theme={theme}>
          {overview.state.deliveryJobs.filter((job) => job.status === "in_transit" || job.status === "delivered").map((job) => <View key={job.id} style={[styles.row, { borderColor: theme.border }]}>
            <View style={styles.rowContent}><Text style={[styles.rowTitle, { color: theme.text }]}>{job.documentNo}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>Trạng thái: {statusLabel(job.status)}</Text></View>
            <AppButton label="Chụp ảnh xác nhận" onPress={() => void confirmReceipt(job.id)} pending={pending === job.id} style={styles.compactButton} />
          </View>)}
          {overview.state.deliveryJobs.filter((job) => job.status === "in_transit" || job.status === "delivered").length === 0 ? <Empty text="Chưa có chuyến giao cần bạn xác nhận." theme={theme} /> : null}
        </Section>
      </> : null}

      {session.user.role === "supplier" ? <>
        <SummaryCard label="Cửa hàng cần thanh toán" value={currency(supplierBalance)} theme={theme} />
        <Text style={[styles.copy, { color: theme.textMuted }]}>Hạn thanh toán: Shop sẽ báo lại.</Text>
        <Section title="Phiếu mua của tôi" theme={theme}>
          <SelectableDocuments documents={overview.state.purchaseOrders.map((order) => ({ id: order.id, code: order.documentNo, state: order.status }))} selectedId={selectedPurchaseOrder?.id} onSelect={setSelectedPurchaseOrderId} theme={theme} />
          {selectedPurchaseOrder ? <SupplierPurchaseDetail order={selectedPurchaseOrder} canShowAgreedPrice={surface.canShowSupplierAgreedPrice} pending={pending === selectedPurchaseOrder.id} onResponse={supplierResponse} onDeliveryNotice={() => void submitSupplierNotice(selectedPurchaseOrder.id)} theme={theme} /> : null}
        </Section>
      </> : null}

      {session.user.role === "worker" ? <WorkerWorkPanel overview={overview} theme={theme} pending={pending} onClaim={claimWork} onOpenTracking={openNativeTracking} onCompleteDelivery={submitDeliveryCompletion} recipientName={recipientName} deliveryEvidence={deliveryEvidence} onRecipientNameChange={setRecipientName} onDeliveryEvidenceChange={setDeliveryEvidence} /> : null}

      {session.user.role === "driver" ? <Section title="Chuyến giao được phân công" theme={theme}>
        <Text style={[styles.copy, { color: theme.textMuted }]}>Bản đồ và GPS mở ngay trong ứng dụng. Số lượng thực giao do shop duyệt, không sửa trên điện thoại.</Text>
        <SelectableDocuments documents={overview.state.deliveryJobs.map((job) => ({ id: job.id, code: job.documentNo, state: job.status }))} selectedId={selectedDriverDelivery?.id} onSelect={setSelectedDriverDeliveryId} theme={theme} />
        {selectedDriverDelivery ? <DriverDeliveryDetail job={selectedDriverDelivery} salesOrder={overview.state.salesOrders.find((order) => order.id === selectedDriverDelivery.salesOrderId)} canOpenMap={surface.canOpenInAppMap} onOpenTracking={openNativeTracking} onCompleteDelivery={submitDeliveryCompletion} pending={pending === selectedDriverDelivery.id} recipientName={recipientName} deliveryEvidence={deliveryEvidence} onRecipientNameChange={setRecipientName} onDeliveryEvidenceChange={setDeliveryEvidence} theme={theme} /> : null}
      </Section> : null}

      {session.user.role === "dispatcher" ? <Section title="Điều phối giao hàng" theme={theme}>
        <Text style={[styles.copy, { color: theme.textMuted }]}>Xem trạng thái chuyến được phân công và bản đồ điều hành ngay trong ứng dụng. Các thay đổi chứng từ có hậu quả tài chính vẫn do server kiểm soát.</Text>
        <SelectableDocuments documents={overview.state.deliveryJobs.map((job) => ({ id: job.id, code: job.documentNo, state: job.status }))} selectedId={selectedDriverDelivery?.id} onSelect={setSelectedDriverDeliveryId} theme={theme} />
        {selectedDriverDelivery ? <View style={[styles.detailCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.text }]}>{selectedDriverDelivery.documentNo}</Text><Text style={[styles.copy, { color: theme.textMuted }]}>Ngày dự kiến: {selectedDriverDelivery.plannedDate}</Text><StatusChip label={statusLabel(selectedDriverDelivery.status)} tone={deliveryTone(selectedDriverDelivery.status)} />{surface.canOpenInAppMap ? <AppButton label="Mở bản đồ điều hành trong ứng dụng" onPress={openNativeTracking} style={styles.action} /> : null}</View> : <Empty text="Chưa có chuyến giao trong phạm vi điều phối của bạn." theme={theme} />}
      </Section> : null}
    </ScrollView>
  );
}

function CustomerOrderDetail({ order, canShowPrice, onPaymentProof, pending, theme }: {
  order: MobilePortalOverview["state"]["salesOrders"][number];
  canShowPrice: boolean;
  onPaymentProof: () => void;
  pending: boolean;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return <View style={[styles.detailCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
    <Text style={[styles.cardTitle, { color: theme.text }]}>{order.documentNo}</Text>
    <StatusChip label={statusLabel(order.status)} tone={deliveryTone(order.status)} />
    <Text style={[styles.copy, { color: theme.textMuted }]}>Địa chỉ giao: {order.deliveryAddress ?? "Shop sẽ xác nhận lại địa chỉ giao."}</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Phương thức thanh toán: {paymentMethodLabel(order.paymentMethod)}</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Số dòng hàng: {order.lines.length}</Text>
    {canShowPrice ? <Text style={[styles.detailValue, { color: theme.text }]}>Tạm tính theo đơn: {currency(orderTotal(order))}</Text> : null}
    {order.paymentMethod === "transfer" ? <AppButton label="Chụp minh chứng chuyển khoản" onPress={onPaymentProof} pending={pending} tone="secondary" /> : null}
  </View>;
}

function SupplierPurchaseDetail({ order, canShowAgreedPrice, pending, onResponse, onDeliveryNotice, theme }: {
  order: MobilePortalOverview["state"]["purchaseOrders"][number];
  canShowAgreedPrice: boolean;
  pending: boolean;
  onResponse: (purchaseOrderId: string, status: "available" | "unavailable") => void;
  onDeliveryNotice: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return <View style={[styles.detailCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
    <Text style={[styles.cardTitle, { color: theme.text }]}>{order.documentNo}</Text>
    <StatusChip label={statusLabel(order.status)} tone="neutral" />
    <Text style={[styles.copy, { color: theme.textMuted }]}>Dự kiến giao: {order.expectedDeliveryDate ?? "Shop sẽ xác nhận lại"}</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Số dòng hàng: {order.lines.length}</Text>
    {canShowAgreedPrice ? <Text style={[styles.detailValue, { color: theme.text }]}>Giá trị theo phiếu đã thỏa thuận: {currency(purchaseOrderTotal(order))}</Text> : null}
    <View style={styles.inlineActions}>
      <AppButton label="Có thể cung ứng" onPress={() => onResponse(order.id, "available")} pending={pending} style={styles.inlineButton} />
      <AppButton label="Chưa thể cung ứng" onPress={() => onResponse(order.id, "unavailable")} pending={pending} tone="secondary" style={styles.inlineButton} />
    </View>
    <AppButton label="Thông báo đã giao" onPress={onDeliveryNotice} pending={pending} tone="secondary" />
  </View>;
}

function WorkerWorkPanel({
  overview,
  theme,
  pending,
  onClaim,
  onOpenTracking,
  onCompleteDelivery,
  recipientName,
  deliveryEvidence,
  onRecipientNameChange,
  onDeliveryEvidenceChange
}: {
  overview: MobilePortalOverview;
  theme: ReturnType<typeof useAppTheme>;
  pending?: string;
  onClaim: (workOrderId: string, expectedVersion?: number) => Promise<void>;
  onOpenTracking: () => void;
  onCompleteDelivery: (deliveryJobId: string) => Promise<void>;
  recipientName: string;
  deliveryEvidence: string;
  onRecipientNameChange: (value: string) => void;
  onDeliveryEvidenceChange: (value: string) => void;
}) {
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string>();
  const selectedWorkOrder = overview.state.workOrders.find((work) => work.id === selectedWorkOrderId) ?? overview.state.workOrders[0];
  const deliveryJob = selectedWorkOrder ? findDeliveryForWorkOrder(selectedWorkOrder, overview.state.deliveryJobs) : undefined;
  const salesOrder = selectedWorkOrder?.salesOrderId ? overview.state.salesOrders.find((order) => order.id === selectedWorkOrder.salesOrderId) : undefined;
  const hasClaimedWork = selectedWorkOrder?.status !== "open";

  return <Section title="Công việc được giao" theme={theme}>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Chỉ thấy công việc của bạn hoặc việc đang mở để nhận. Giá, VAT, tồn kho và số lượng giao không hiển thị tại đây.</Text>
    <SelectableDocuments documents={overview.state.workOrders.map((work) => ({ id: work.id, code: work.documentNo, state: work.status }))} selectedId={selectedWorkOrder?.id} onSelect={setSelectedWorkOrderId} theme={theme} />
    {selectedWorkOrder ? <View style={[styles.detailCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{selectedWorkOrder.documentNo}</Text>
      <StatusChip label={statusLabel(selectedWorkOrder.status)} tone={deliveryTone(selectedWorkOrder.status)} />
      <Text style={[styles.copy, { color: theme.textMuted }]}>Công việc: {selectedWorkOrder.workType}</Text>
      <Text style={[styles.copy, { color: theme.textMuted }]}>Ngày làm: {selectedWorkOrder.workDate}</Text>
      {selectedWorkOrder.status === "open" ? <AppButton label="Nhận việc" onPress={() => void onClaim(selectedWorkOrder.id, selectedWorkOrder.version)} pending={pending === selectedWorkOrder.id} /> : null}
      {hasClaimedWork && deliveryJob ? <>
        <Text style={[styles.copy, { color: theme.textMuted }]}>Địa chỉ giao: {salesOrder?.deliveryAddress ?? "Shop sẽ cập nhật khi giao việc."}</Text>
        <Text style={[styles.copy, { color: theme.textMuted }]}>Chuyến: {deliveryJob.documentNo} · {statusLabel(deliveryJob.status)}</Text>
        <AppButton label="Mở hành trình trong ứng dụng" onPress={onOpenTracking} tone="secondary" />
        {deliveryJob.status === "in_transit" ? <DeliveryCompletionForm deliveryJobId={deliveryJob.id} pending={pending === deliveryJob.id} recipientName={recipientName} deliveryEvidence={deliveryEvidence} onRecipientNameChange={onRecipientNameChange} onDeliveryEvidenceChange={onDeliveryEvidenceChange} onComplete={onCompleteDelivery} theme={theme} /> : null}
      </> : null}
      {hasClaimedWork && !deliveryJob ? <Text style={[styles.empty, { color: theme.textMuted }]}>Shop chưa gán chuyến giao cho công việc này. Hành trình sẽ hiện ngay trong ứng dụng sau khi được phân công.</Text> : null}
    </View> : <Empty text="Chưa có công việc để xem chi tiết." theme={theme} />}
  </Section>;
}

function DriverDeliveryDetail({
  job,
  salesOrder,
  canOpenMap,
  onOpenTracking,
  onCompleteDelivery,
  pending,
  recipientName,
  deliveryEvidence,
  onRecipientNameChange,
  onDeliveryEvidenceChange,
  theme
}: {
  job: MobilePortalOverview["state"]["deliveryJobs"][number];
  salesOrder?: MobilePortalOverview["state"]["salesOrders"][number];
  canOpenMap: boolean;
  onOpenTracking: () => void;
  onCompleteDelivery: (deliveryJobId: string) => Promise<void>;
  pending: boolean;
  recipientName: string;
  deliveryEvidence: string;
  onRecipientNameChange: (value: string) => void;
  onDeliveryEvidenceChange: (value: string) => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return <View style={[styles.detailCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
    <Text style={[styles.cardTitle, { color: theme.text }]}>{job.documentNo}</Text>
    <StatusChip label={statusLabel(job.status)} tone={deliveryTone(job.status)} />
    <Text style={[styles.copy, { color: theme.textMuted }]}>Ngày dự kiến: {job.plannedDate}</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Điểm giao: {salesOrder?.deliveryAddress ?? "Shop sẽ cập nhật điểm giao."}</Text>
    {canOpenMap ? <AppButton label="Mở bản đồ trong ứng dụng" onPress={onOpenTracking} tone="secondary" /> : null}
    {job.status === "in_transit" ? <DeliveryCompletionForm deliveryJobId={job.id} pending={pending} recipientName={recipientName} deliveryEvidence={deliveryEvidence} onRecipientNameChange={onRecipientNameChange} onDeliveryEvidenceChange={onDeliveryEvidenceChange} onComplete={onCompleteDelivery} theme={theme} /> : <Text style={[styles.empty, { color: theme.textMuted }]}>Khi chuyến ở trạng thái đang giao, bạn có thể chụp ảnh và gửi xác nhận chờ duyệt.</Text>}
  </View>;
}

function DeliveryCompletionForm({ deliveryJobId, pending, recipientName, deliveryEvidence, onRecipientNameChange, onDeliveryEvidenceChange, onComplete, theme }: {
  deliveryJobId: string;
  pending: boolean;
  recipientName: string;
  deliveryEvidence: string;
  onRecipientNameChange: (value: string) => void;
  onDeliveryEvidenceChange: (value: string) => void;
  onComplete: (deliveryJobId: string) => Promise<void>;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return <View style={styles.completionCard}>
    <Text style={[styles.detailLabel, { color: theme.text }]}>Xác nhận giao hàng</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Bạn chỉ gửi ảnh và bằng chứng. Nếu có chênh lệch số lượng, hãy báo điều phối; không sửa số lượng trong ứng dụng.</Text>
    <TextInput accessibilityLabel="Tên người nhận" onChangeText={onRecipientNameChange} placeholder="Tên người nhận" placeholderTextColor={theme.textMuted} style={[styles.input, { borderColor: theme.border, color: theme.text }]} value={recipientName} />
    <TextInput accessibilityLabel="Mô tả bằng chứng giao" multiline onChangeText={onDeliveryEvidenceChange} placeholder="Mô tả bằng chứng giao" placeholderTextColor={theme.textMuted} style={[styles.input, styles.address, { borderColor: theme.border, color: theme.text }]} value={deliveryEvidence} />
    <AppButton label="Chụp ảnh và gửi chờ duyệt" onPress={() => void onComplete(deliveryJobId)} pending={pending} />
  </View>;
}

function Section({ title, theme, children }: { title: string; theme: ReturnType<typeof useAppTheme>; children: ReactNode }) {
  return <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>{children}</View>;
}

function SummaryCard({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useAppTheme> }) {
  return <View style={[styles.summary, { backgroundColor: theme.brandSoft, borderColor: theme.border }]}><Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{label}</Text><Text style={[styles.summaryValue, { color: theme.text }]}>{value}</Text></View>;
}

function SelectableDocuments({ documents, selectedId, onSelect, theme }: {
  documents: Array<{ id: string; code: string; state: string }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  if (documents.length === 0) return <Empty text="Chưa có dữ liệu cần xử lý." theme={theme} />;
  return <>{documents.map((document) => <View key={document.id} style={[styles.row, { borderColor: theme.border }]}>
    <View style={styles.rowContent}><Text style={[styles.rowTitle, { color: theme.text }]}>{document.code}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>Trạng thái: {statusLabel(document.state)}</Text></View>
    {selectedId === document.id ? <StatusChip label="Đang xem" tone="active" /> : <AppButton label="Xem chi tiết" onPress={() => onSelect(document.id)} tone="secondary" style={styles.compactButton} />}
  </View>)}</>;
}

function InlineError({ message, onRetry, theme }: { message: string; onRetry: () => void; theme: ReturnType<typeof useAppTheme> }) {
  return <View accessibilityRole="alert" style={[styles.inlineError, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}><Text style={[styles.inlineErrorText, { color: theme.danger }]}>{message}</Text><AppButton label="Thử lại" onPress={onRetry} tone="secondary" style={styles.retryButton} /></View>;
}

function Empty({ text, theme }: { text: string; theme: ReturnType<typeof useAppTheme> }) {
  return <Text style={[styles.empty, { color: theme.textMuted }]}>{text}</Text>;
}

function balanceOf(entries: Array<{ direction: "debit" | "credit"; amount: number; reversedById?: string }>) {
  return entries.filter((entry) => !entry.reversedById).reduce((sum, entry) => sum + (entry.direction === "debit" ? entry.amount : -entry.amount), 0);
}

function orderTotal(order: MobilePortalOverview["state"]["salesOrders"][number]) {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice * (1 + line.taxRate), 0);
}

function purchaseOrderTotal(order: MobilePortalOverview["state"]["purchaseOrders"][number]) {
  return order.lines.reduce((sum, line) => sum + line.orderedQuantity * line.unitCost * (1 + line.taxRate), 0);
}

function currency(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function idempotencyKey(scope: string) {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function messageOf(cause: unknown) {
  return cause instanceof MobileApiError || cause instanceof Error ? cause.message : "Vui lòng thử lại.";
}

async function captureCameraImage(purpose: string, optional = false) {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Chưa có quyền máy ảnh", `Cho phép máy ảnh để chụp ${purpose}.`);
    return undefined;
  }
  const captured = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (captured.canceled || !captured.assets[0]) {
    if (!optional) Alert.alert("Chưa có ảnh", `Cần chụp ${purpose} để tiếp tục.`);
    return undefined;
  }
  const image = captured.assets[0];
  return {
    uri: image.uri,
    name: image.fileName ?? `mobile-${Date.now()}.jpg`,
    type: image.mimeType ?? "image/jpeg"
  };
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Nháp",
    open: "Chờ nhận",
    claimed: "Đã nhận",
    assigned: "Đã phân công",
    loading: "Đang bốc hàng",
    in_transit: "Đang giao",
    delivered: "Đã giao - chờ duyệt",
    completed: "Hoàn tất",
    confirmed: "Đã xác nhận",
    ordered: "Đã đặt",
    partially_received: "Đã nhận một phần",
    fully_received: "Đã nhận đủ",
    available: "Có thể cung ứng",
    unavailable: "Chưa thể cung ứng"
  };
  return labels[status] ?? status;
}

function paymentMethodLabel(method?: string) {
  return method === "transfer" ? "Chuyển khoản" : method === "credit_requested" ? "Xin trả sau" : "Shop sẽ xác nhận";
}

function deliveryTone(status: string): "active" | "neutral" | "warning" {
  return status === "in_transit" || status === "claimed" || status === "confirmed" ? "active" : status === "failed" ? "warning" : "neutral";
}

function roleHeading(role: string) {
  return role === "customer" ? "KHÁCH HÀNG" : role === "supplier" ? "NHÀ CUNG CẤP" : role === "worker" ? "CÔNG VIỆC HIỆN TRƯỜNG" : role === "driver" ? "GIAO HÀNG" : "ĐIỀU PHỐI";
}

function headlineForRole(role: string) {
  if (role === "customer") return "Đặt hàng và thanh toán";
  if (role === "supplier") return "Phiếu mua và phản hồi giao hàng";
  if (role === "worker") return "Công việc được giao";
  if (role === "driver") return "Chuyến hàng của bạn";
  return "Điều phối chuyến giao";
}

function copyForRole(role: string) {
  if (role === "customer") return "Giá và đơn hàng sẽ được shop xác nhận trước khi giao.";
  if (role === "supplier") return "Sau khi bạn phản hồi, shop sẽ kiểm tra rồi thông báo lại.";
  if (role === "worker") return "Chỉ nhận việc được mở. Sản lượng và các bước tài chính vẫn cần duyệt theo quy trình.";
  if (role === "driver") return "Chỉ xem chuyến được giao. GPS và bằng chứng giao được kiểm soát theo chuyến.";
  return "Theo dõi vận hành qua bản đồ trong ứng dụng; thay đổi chứng từ vẫn được server kiểm soát.";
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 16, padding: 20, paddingBottom: 32 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.8, marginTop: -4 },
  copy: { fontSize: 16, lineHeight: 24 },
  summary: { borderRadius: 18, borderWidth: 1, padding: 18 },
  summaryLabel: { fontSize: 15, fontWeight: "700" },
  summaryValue: { fontSize: 27, fontWeight: "900", marginTop: 7 },
  card: { borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 },
  detailCard: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 14 },
  cardTitle: { fontSize: 19, fontWeight: "800" },
  detailLabel: { fontSize: 16, fontWeight: "800" },
  detailValue: { fontSize: 18, fontWeight: "900" },
  section: { borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 },
  sectionTitle: { fontSize: 19, fontWeight: "800" },
  select: { borderRadius: 14, borderWidth: 1, padding: 14 },
  selectLabel: { fontSize: 14, fontWeight: "700" },
  selectValue: { fontSize: 16, fontWeight: "800", lineHeight: 23, marginTop: 4 },
  selectHint: { fontSize: 14, fontWeight: "800", marginTop: 7 },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  address: { minHeight: 92, paddingTop: 13, textAlignVertical: "top" },
  action: { marginTop: 2 },
  row: { alignItems: "center", borderTopWidth: 1, flexDirection: "row", gap: 12, paddingVertical: 14 },
  rowContent: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: "800" },
  rowMeta: { fontSize: 14, lineHeight: 20 },
  compactButton: { minWidth: 148 },
  inlineActions: { flexDirection: "row", gap: 10 },
  inlineButton: { flex: 1 },
  completionCard: { gap: 10, marginTop: 4 },
  empty: { fontSize: 16, lineHeight: 23, paddingVertical: 8 },
  inlineError: { borderRadius: 14, borderWidth: 1, gap: 10, padding: 14 },
  inlineErrorText: { fontSize: 16, fontWeight: "700", lineHeight: 23 },
  retryButton: { alignSelf: "flex-start", minWidth: 120 }
});
