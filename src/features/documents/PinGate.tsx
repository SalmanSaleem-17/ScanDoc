import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Header, Icon, IconButton, Label, Toggle } from "../../components/ui";
import { useTheme } from "../../theme/provider";
import {
  PIN_LENGTH,
  clearPin,
  hasPin,
  isValidPin,
  lockoutRemaining,
  setPin,
  verifyPin,
} from "../../services/pin";
import { deleteDocumentForever } from "../../services/storage";
import { documentFolders, listFolders, setFolderLocked } from "../../services/folders";
import { isLockedPath } from "../../services/folderPaths.mjs";
import { useDocuments } from "./provider";

export type PinMode = "unlock" | "setup" | "change";

/**
 * The one place the folder PIN is typed. "setup" creates it (twice, with a
 * written acknowledgement that there is no recovery), "unlock" opens locked
 * folders for this session, "change" asks for the current PIN and then a new
 * one. An in-window overlay, like the other pickers, so the status bar stays
 * right. "Forgot PIN" is offered on the unlock screen: it erases every
 * document inside locked folders and removes the PIN, after two confirmations
 * that spell that out.
 */
export function PinGate({
  visible,
  mode,
  onDone,
  onClose,
}: {
  visible: boolean;
  mode: PinMode;
  onDone: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { refresh } = useDocuments();
  const [step, setStep] = useState<"current" | "new" | "confirm" | "enter">("enter");
  const [pin, setPinValue] = useState("");
  const [first, setFirst] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const [waitMs, setWaitMs] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setPinValue("");
    setFirst("");
    setAcknowledged(false);
    setMessage("");
    setStep(mode === "setup" ? "new" : mode === "change" ? "current" : "enter");
    void lockoutRemaining().then(setWaitMs);
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, mode, onClose]);
  useEffect(() => {
    if (waitMs <= 0) return;
    const timer = setInterval(() => setWaitMs((value) => Math.max(0, value - 1000)), 1000);
    return () => clearInterval(timer);
  }, [waitMs]);

  const submit = useCallback(async () => {
    if (busy || !isValidPin(pin)) return;
    setBusy(true);
    try {
      if (step === "enter" || step === "current") {
        const outcome = await verifyPin(pin);
        if (!outcome.ok) {
          setPinValue("");
          if (outcome.waitMs > 0) {
            setWaitMs(outcome.waitMs);
            setMessage(`Too many attempts. Wait ${Math.ceil(outcome.waitMs / 1000)} s.`);
          } else setMessage(`Wrong PIN. ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? "try" : "tries"} left before a wait.`);
          return;
        }
        if (step === "enter") {
          onDone();
          return;
        }
        setPinValue("");
        setMessage("");
        setStep("new");
        return;
      }
      if (step === "new") {
        setFirst(pin);
        setPinValue("");
        setMessage("");
        setStep("confirm");
        return;
      }
      if (pin !== first) {
        setPinValue("");
        setFirst("");
        setStep("new");
        setMessage("The two PINs did not match. Start again.");
        return;
      }
      await setPin(pin);
      onDone();
    } catch {
      setMessage("Could not save the PIN. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, pin, step, first, onDone]);

  function forgot() {
    Alert.alert(
      "Forgot your PIN?",
      "There is no way to recover it. The only reset erases every document inside locked folders from this device, then removes the PIN. Documents outside locked folders are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () =>
            Alert.alert("Erase locked documents?", "This cannot be undone.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Erase and reset PIN",
                style: "destructive",
                onPress: () =>
                  void (async () => {
                    setBusy(true);
                    try {
                      const [folders, assignments] = await Promise.all([listFolders(), documentFolders()]);
                      const locked = folders.filter((f) => f.locked).map((f) => f.path);
                      for (const [id, path] of Object.entries(assignments))
                        if (isLockedPath(path, locked)) await deleteDocumentForever(id).catch(() => {});
                      for (const path of locked) await setFolderLocked(path, false);
                      await clearPin();
                      await refresh();
                      Alert.alert("Reset complete", "Locked documents were erased and the PIN removed. You can set a new PIN when you next lock a folder.");
                      onClose();
                    } finally {
                      setBusy(false);
                    }
                  })(),
              },
            ]),
        },
      ],
    );
  }

  if (!visible) return null;
  const title =
    step === "enter" ? "Enter your PIN" : step === "current" ? "Current PIN" : step === "new" ? "Choose a PIN" : "Repeat the PIN";
  const canSubmit = isValidPin(pin) && waitMs <= 0 && !busy && (step !== "confirm" || acknowledged);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <SafeAreaView style={{ flex: 1, padding: 20 }} edges={["top", "bottom", "left", "right"]}>
        <Header
          title={title}
          subtitle={`${PIN_LENGTH} digits · protects your locked folders`}
          action={<IconButton name="close-outline" label="Cancel" onPress={onClose} />}
        />
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <View
                key={index}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: colors.blue,
                  backgroundColor: index < pin.length ? colors.blue : "transparent",
                }}
              />
            ))}
          </View>
          <TextInput
            accessibilityLabel={title}
            value={pin}
            onChangeText={(value) => {
              setPinValue(value.replace(/\D/g, "").slice(0, PIN_LENGTH));
              setMessage("");
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={PIN_LENGTH}
            autoFocus
            editable={waitMs <= 0 && !busy}
            onSubmitEditing={() => void submit()}
            style={{
              color: colors.text,
              fontSize: 24,
              letterSpacing: 12,
              textAlign: "center",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              minHeight: 56,
              backgroundColor: colors.background,
            }}
          />
          {!!message && (
            <Label style={{ color: colors.danger, fontSize: 13, textAlign: "center" }}>{message}</Label>
          )}
          {waitMs > 0 && !message && (
            <Label style={{ color: colors.danger, fontSize: 13, textAlign: "center" }}>
              {`Too many attempts. Wait ${Math.ceil(waitMs / 1000)} s.`}
            </Label>
          )}
          {(step === "new" || step === "confirm") && (
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.dangerTint,
              }}
            >
              <Icon name="warning-outline" color={colors.danger} />
              <Label style={{ flex: 1, fontSize: 13, color: colors.text }}>
                Do not forget this PIN. It is stored only on this phone and cannot be recovered or emailed to you. If you forget it, the only reset erases every document in your locked folders.
              </Label>
            </View>
          )}
          {step === "confirm" && (
            <Toggle
              label="I understand there is no way to recover a forgotten PIN"
              value={acknowledged}
              onChange={setAcknowledged}
            />
          )}
          <Button
            title={step === "confirm" ? "Save PIN" : step === "new" ? "Next" : "Unlock"}
            icon={step === "enter" ? "lock-open-outline" : "checkmark-outline"}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
          {step === "enter" && (
            <Pressable accessibilityRole="button" onPress={forgot} disabled={busy} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}>
              <Label style={{ color: colors.secondary, fontSize: 13 }}>Forgot your PIN?</Label>
            </Pressable>
          )}
        </Card>
      </SafeAreaView>
    </View>
  );
}

/** True when a PIN exists; used to decide between setup and unlock. */
export function usePinExists(refreshKey?: unknown) {
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void hasPin().then((value) => {
      if (live) setExists(value);
    });
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return exists;
}
