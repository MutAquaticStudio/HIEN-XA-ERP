import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import type { ReactNode } from "react";
import { AppButton, StatusChip } from "./mobile-ui";
import { useAppTheme } from "../lib/ui";

export type NativeWorkflowStep = {
  id: string;
  label: string;
  description?: string;
};

export type NativeWorkflowStatus = "idle" | "loading" | "empty" | "error" | "success";

export type NativeWorkflowNotice = {
  status: NativeWorkflowStatus;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export type NativeSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type NativeTextFieldProps = {
  autoCapitalize?: TextInputProps["autoCapitalize"];
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: string;
  editable?: boolean;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  testID?: string;
};

export type NativeActionField<TValues extends Record<string, string>> =
  | ({
      kind: "text";
      key: keyof TValues & string;
    } & Omit<NativeTextFieldProps, "value" | "onChangeText">)
  | {
      kind: "select";
      key: keyof TValues & string;
      label: string;
      options: NativeSelectOption[];
      helperText?: string;
      error?: string;
      disabled?: boolean;
      testID?: string;
    };

export type NativeReviewLine = {
  label: string;
  value: string;
  emphasis?: "normal" | "strong" | "warning";
};

export type NativeReviewSummary = {
  title: string;
  description?: string;
  lines: NativeReviewLine[];
  warnings?: string[];
  confirmationText?: string;
};

function noticeTone(status: NativeWorkflowStatus) {
  if (status === "error") return "warning" as const;
  if (status === "success") return "active" as const;
  if (status === "loading") return "neutral" as const;
  return "neutral" as const;
}

export function NativeWorkflowNoticeCard({ notice }: { notice: NativeWorkflowNotice }) {
  const theme = useAppTheme();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: notice.status === "error" ? theme.dangerSoft : theme.surface, borderColor: notice.status === "error" ? theme.danger : theme.border }]}
    >
      <View style={styles.noticeHeading}>
        {notice.status === "loading" ? <ActivityIndicator color={theme.brand} /> : <StatusChip label={notice.status === "success" ? "Đã cập nhật" : notice.status === "error" ? "Cần xử lý" : notice.status === "empty" ? "Chưa có dữ liệu" : "Đang chuẩn bị"} tone={noticeTone(notice.status)} />}
        <Text style={[styles.noticeTitle, { color: theme.text }]}>{notice.title}</Text>
      </View>
      <Text style={[styles.noticeMessage, { color: theme.textMuted }]}>{notice.message}</Text>
      {notice.actionLabel && notice.onAction ? <AppButton label={notice.actionLabel} onPress={() => notice.onAction?.()} tone={notice.status === "error" ? "danger" : "secondary"} style={styles.noticeAction} /> : null}
    </View>
  );
}

export function NativeWorkflowStepper({ steps, currentStep }: { steps: NativeWorkflowStep[]; currentStep: number }) {
  const theme = useAppTheme();

  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: Math.max(steps.length, 1), now: Math.min(currentStep + 1, Math.max(steps.length, 1)) }} style={styles.stepper}>
      {steps.map((step, index) => {
        const active = index === currentStep;
        const complete = index < currentStep;
        const backgroundColor = active || complete ? theme.brand : theme.surfaceMuted;
        const color = active || complete ? theme.surface : theme.textMuted;

        return (
          <View key={step.id} style={styles.stepItem}>
            <View style={[styles.stepNumber, { backgroundColor }]}><Text style={[styles.stepNumberText, { color }]}>{complete ? "✓" : index + 1}</Text></View>
            <View style={styles.stepTextWrap}>
              <Text style={[styles.stepLabel, { color: active ? theme.text : theme.textMuted }]} numberOfLines={2}>{step.label}</Text>
              {active && step.description ? <Text style={[styles.stepDescription, { color: theme.textMuted }]}>{step.description}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function NativeWorkflowFormShell({
  title,
  description,
  steps,
  currentStep,
  children,
  backLabel = "Quay lại",
  continueLabel = "Tiếp tục",
  onBack,
  onContinue,
  continueDisabled = false,
  pending = false,
  notice
}: {
  title: string;
  description?: string;
  steps: NativeWorkflowStep[];
  currentStep: number;
  children: ReactNode;
  backLabel?: string;
  continueLabel?: string;
  onBack?: () => void;
  onContinue?: () => void;
  continueDisabled?: boolean;
  pending?: boolean;
  notice?: NativeWorkflowNotice;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.shell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.shellTitle, { color: theme.text }]}>{title}</Text>
      {description ? <Text style={[styles.shellDescription, { color: theme.textMuted }]}>{description}</Text> : null}
      <NativeWorkflowStepper steps={steps} currentStep={currentStep} />
      {notice ? <NativeWorkflowNoticeCard notice={notice} /> : null}
      <View style={styles.shellContent}>{children}</View>
      {onBack || onContinue ? (
        <View style={styles.shellActions}>
          {onBack ? <AppButton label={backLabel} onPress={() => onBack()} tone="secondary" style={styles.actionButton} /> : null}
          {onContinue ? <AppButton label={continueLabel} onPress={() => onContinue()} disabled={continueDisabled} pending={pending} style={styles.actionButton} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function NativeLabeledTextField({
  autoCapitalize,
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  error,
  editable = true,
  multiline = false,
  secureTextEntry = false,
  keyboardType,
  testID
}: NativeTextFieldProps) {
  const theme = useAppTheme();
  const hint = error ?? helperText;

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        secureTextEntry={secureTextEntry}
        style={[styles.textInput, multiline && styles.textArea, { backgroundColor: editable ? theme.background : theme.surfaceMuted, borderColor: error ? theme.danger : theme.border, color: theme.text }]}
        testID={testID}
        value={value}
      />
      {hint ? <Text accessibilityLiveRegion="polite" style={[styles.fieldHint, { color: error ? theme.danger : theme.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function NativeLabeledSelectField({ label, value, options, onValueChange, helperText, error, disabled = false, testID }: {
  label: string;
  value: string;
  options: NativeSelectOption[];
  onValueChange: (value: string) => void;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useAppTheme();
  const hint = error ?? helperText;

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <View accessibilityLabel={label} style={styles.selectOptions} testID={testID}>
        {options.map((option) => {
          const selected = option.value === value;
          const optionDisabled = disabled || option.disabled;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: optionDisabled }}
              disabled={optionDisabled}
              key={option.value}
              onPress={() => onValueChange(option.value)}
              style={({ pressed }) => [
                styles.selectOption,
                { backgroundColor: selected ? theme.brandSoft : theme.background, borderColor: selected ? theme.brand : theme.border },
                (pressed || optionDisabled) && styles.selectOptionPressed
              ]}
            >
              <View style={[styles.radioMark, { borderColor: selected ? theme.brand : theme.textMuted, backgroundColor: selected ? theme.brand : "transparent" }]}>{selected ? <Text style={[styles.radioTick, { color: theme.surface }]}>✓</Text> : null}</View>
              <View style={styles.selectCopy}>
                <Text style={[styles.selectLabel, { color: theme.text }]}>{option.label}</Text>
                {option.description ? <Text style={[styles.selectDescription, { color: theme.textMuted }]}>{option.description}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text accessibilityLiveRegion="polite" style={[styles.fieldHint, { color: error ? theme.danger : theme.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function NativeReviewConfirmationCard({ review, confirmLabel = "Xác nhận thực hiện", onConfirm, pending = false, disabled = false }: {
  review: NativeReviewSummary;
  confirmLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.reviewCard, { backgroundColor: theme.brandSoft, borderColor: theme.border }]}>
      <View style={styles.reviewHeading}>
        <StatusChip label="Bước rà soát" tone="active" />
        <Text style={[styles.reviewTitle, { color: theme.text }]}>{review.title}</Text>
      </View>
      {review.description ? <Text style={[styles.reviewDescription, { color: theme.textMuted }]}>{review.description}</Text> : null}
      <View style={[styles.reviewLines, { borderColor: theme.border }]}>
        {review.lines.map((line) => (
          <View key={`${line.label}-${line.value}`} style={styles.reviewLine}>
            <Text style={[styles.reviewLineLabel, { color: theme.textMuted }]}>{line.label}</Text>
            <Text style={[styles.reviewLineValue, { color: line.emphasis === "warning" ? theme.danger : theme.text, fontWeight: line.emphasis === "normal" ? "600" : "800" }]}>{line.value}</Text>
          </View>
        ))}
      </View>
      {review.warnings?.map((warning) => <Text key={warning} accessibilityLiveRegion="polite" style={[styles.warning, { color: theme.danger }]}>{warning}</Text>)}
      <Text style={[styles.confirmationText, { color: theme.text }]}>{review.confirmationText ?? "Tôi đã kiểm tra số lượng, số tiền và hậu quả của thao tác này."}</Text>
      <AppButton label={confirmLabel} onPress={() => onConfirm()} disabled={disabled} pending={pending} style={styles.confirmButton} />
    </View>
  );
}

export function NativeModuleActionForm<TValues extends Record<string, string>>({
  title,
  description,
  fields,
  values,
  onChange,
  onReview,
  review,
  onConfirm,
  reviewLabel = "Xem lại trước khi xác nhận",
  confirmLabel,
  pending = false,
  disabled = false,
  notice
}: {
  title?: string;
  description?: string;
  fields: NativeActionField<TValues>[];
  values: TValues;
  onChange: (key: keyof TValues & string, value: string) => void;
  onReview: () => void;
  review?: NativeReviewSummary;
  onConfirm: () => void;
  reviewLabel?: string;
  confirmLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  notice?: NativeWorkflowNotice;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.moduleForm, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {title ? <Text style={[styles.moduleFormTitle, { color: theme.text }]}>{title}</Text> : null}
      {description ? <Text style={[styles.moduleFormDescription, { color: theme.textMuted }]}>{description}</Text> : null}
      {notice ? <NativeWorkflowNoticeCard notice={notice} /> : null}
      {fields.map((field) => field.kind === "text" ? (
        <NativeLabeledTextField
          editable={field.editable}
          error={field.error}
          helperText={field.helperText}
          key={field.key}
          keyboardType={field.keyboardType}
          label={field.label}
          multiline={field.multiline}
          onChangeText={(value) => onChange(field.key, value)}
          placeholder={field.placeholder}
          secureTextEntry={field.secureTextEntry}
          testID={field.testID}
          value={values[field.key] ?? ""}
        />
      ) : (
        <NativeLabeledSelectField
          disabled={field.disabled}
          error={field.error}
          helperText={field.helperText}
          key={field.key}
          label={field.label}
          onValueChange={(value) => onChange(field.key, value)}
          options={field.options}
          testID={field.testID}
          value={values[field.key] ?? ""}
        />
      ))}
      {review ? <NativeReviewConfirmationCard review={review} confirmLabel={confirmLabel} onConfirm={onConfirm} pending={pending} disabled={disabled} /> : <AppButton label={reviewLabel} onPress={() => onReview()} pending={pending} disabled={disabled} style={styles.reviewButton} />}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderRadius: 22, borderWidth: 1, padding: 18 },
  shellTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  shellDescription: { fontSize: 16, lineHeight: 24, marginTop: 8 },
  stepper: { gap: 12, marginTop: 18 },
  stepItem: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  stepNumber: { alignItems: "center", borderRadius: 999, height: 30, justifyContent: "center", width: 30 },
  stepNumberText: { fontSize: 15, fontWeight: "900" },
  stepTextWrap: { flex: 1, paddingTop: 3 },
  stepLabel: { fontSize: 16, fontWeight: "800", lineHeight: 20 },
  stepDescription: { fontSize: 14, lineHeight: 19, marginTop: 2 },
  shellContent: { marginTop: 18 },
  shellActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  actionButton: { flex: 1 },
  notice: { borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 14 },
  noticeHeading: { alignItems: "center", flexDirection: "row", gap: 9 },
  noticeTitle: { flex: 1, fontSize: 17, fontWeight: "900", lineHeight: 22 },
  noticeMessage: { fontSize: 16, lineHeight: 23, marginTop: 9 },
  noticeAction: { marginTop: 14 },
  field: { marginTop: 16 },
  fieldLabel: { fontSize: 16, fontWeight: "800", lineHeight: 22, marginBottom: 8 },
  textInput: { borderRadius: 13, borderWidth: 1, fontSize: 16, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12 },
  textArea: { minHeight: 112, textAlignVertical: "top" },
  fieldHint: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  selectOptions: { gap: 9 },
  selectOption: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", minHeight: 56, paddingHorizontal: 13, paddingVertical: 10 },
  selectOptionPressed: { opacity: 0.72 },
  radioMark: { alignItems: "center", borderRadius: 999, borderWidth: 2, height: 22, justifyContent: "center", marginRight: 11, width: 22 },
  radioTick: { fontSize: 14, fontWeight: "900", lineHeight: 16 },
  selectCopy: { flex: 1 },
  selectLabel: { fontSize: 16, fontWeight: "800", lineHeight: 21 },
  selectDescription: { fontSize: 14, lineHeight: 19, marginTop: 2 },
  reviewCard: { borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 15 },
  reviewHeading: { alignItems: "center", flexDirection: "row", gap: 9 },
  reviewTitle: { flex: 1, fontSize: 19, fontWeight: "900", lineHeight: 24 },
  reviewDescription: { fontSize: 16, lineHeight: 23, marginTop: 10 },
  reviewLines: { borderTopWidth: 1, gap: 10, marginTop: 14, paddingTop: 14 },
  reviewLine: { gap: 3 },
  reviewLineLabel: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  reviewLineValue: { fontSize: 17, lineHeight: 23 },
  warning: { fontSize: 15, fontWeight: "800", lineHeight: 21, marginTop: 11 },
  confirmationText: { fontSize: 16, fontWeight: "700", lineHeight: 23, marginTop: 14 },
  confirmButton: { marginTop: 14 },
  moduleForm: { borderRadius: 22, borderWidth: 1, padding: 18 },
  moduleFormTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  moduleFormDescription: { fontSize: 16, lineHeight: 24, marginTop: 8 },
  reviewButton: { marginTop: 20 }
});
