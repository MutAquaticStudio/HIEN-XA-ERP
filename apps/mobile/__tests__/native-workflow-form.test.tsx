import { act, fireEvent, render } from "@testing-library/react-native";
import { ReviewSheet } from "../components/mobile-ui";
import { NativeModuleActionForm, type NativeReviewSummary } from "../components/native-workflow-form";

type PaymentValues = {
  amount: string;
  paymentMethod: string;
};

const review: NativeReviewSummary = {
  title: "Rà soát phiếu thu",
  lines: [
    { label: "Số tiền", value: "1.250.000 đ", emphasis: "strong" },
    { label: "Hậu quả", value: "Tạo phiếu thu chờ xác nhận", emphasis: "warning" }
  ]
};

describe("NativeModuleActionForm", () => {
  it("keeps native fields, review, and explicit confirmation accessible", async () => {
    const onChange = jest.fn();
    const onReview = jest.fn();
    const onConfirm = jest.fn();
    const screen = await render(
      <NativeModuleActionForm<PaymentValues>
        description="Kiểm tra kỹ trước khi gửi lệnh tài chính."
        fields={[
          { kind: "text", key: "amount", label: "Số tiền", keyboardType: "numeric", testID: "amount" },
          {
            kind: "select",
            key: "paymentMethod",
            label: "Phương thức",
            options: [
              { value: "cash", label: "Tiền mặt" },
              { value: "transfer", label: "Chuyển khoản" }
            ]
          }
        ]}
        onChange={onChange}
        onConfirm={onConfirm}
        onReview={onReview}
        review={review}
        title="Tạo phiếu thu"
        values={{ amount: "1250000", paymentMethod: "cash" }}
      />
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("amount"), "1300000");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Chuyển khoản"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Xác nhận thực hiện"));
    });

    expect(onChange).toHaveBeenCalledWith("amount", "1300000");
    expect(onChange).toHaveBeenCalledWith("paymentMethod", "transfer");
    expect(onReview).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit action from the native review sheet", async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <ReviewSheet
        confirmLabel="Xác nhận ghi sổ"
        message="Phiếu thu 1.250.000 đ sẽ được máy chủ kiểm tra lại."
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        title="Rà soát trước khi ghi sổ"
        visible
      />
    );

    expect(screen.getByText("Rà soát trước khi ghi sổ")).toBeTruthy();
    expect(screen.getByText(/Máy chủ sẽ kiểm tra lại quyền/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText("Xác nhận ghi sổ")));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

});
