import { fireEvent, render } from "@testing-library/react-native";
import { AppButton } from "../components/mobile-ui";

describe("AppButton", () => {
  it("keeps the primary action reachable with an accessible label", async () => {
    const onPress = jest.fn();
    const screen = await render(<AppButton label="Tạo đơn nháp" onPress={onPress} />);
    fireEvent.press(screen.getByText("Tạo đơn nháp"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
