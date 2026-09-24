import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import { Button, Card, Label, Section } from "../src/components/ui";
import {
  WorkspaceScreen,
  DocumentPicker,
  Field,
  TaskStatus,
  useTask,
} from "../src/features/workflows/components";
import type { LocalDocument } from "../src/types/document";
import {
  getReceipt,
  getText,
  listReceipts,
  putReceipt,
  putFolder,
  storePdf,
  type Receipt,
} from "../src/services/workspace";
import {
  recognizeDocument,
  withDocumentPages,
} from "../src/features/workflows/processing";
import {
  parseAmount,
  receiptSuggestion,
  receiptCsv,
} from "../src/features/workflows/logic.mjs";
import { runEngine, hasEngine } from "../src/services/engine";
import { useDocuments } from "../src/features/documents/provider";
export default function Receipts() {
  const selection = useRef("");
  const [document, setDocument] = useState<LocalDocument>();
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [amount, setAmount] = useState("");
  const [rows, setRows] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const task = useTask();
  const { documents, refresh } = useDocuments();
  const reload = useCallback(() => {
    void listReceipts()
      .then(setRows)
      .catch(() => Alert.alert("Could not read receipts", "Please try again."));
  }, []);
  useFocusEffect(reload);
  const chosen = rows.filter((row) => selected.includes(row.documentId));
  const totals = chosen.reduce<Record<string, number>>(
    (sum, row) => ({
      ...sum,
      [row.currency]: (sum[row.currency] || 0) + row.cents,
    }),
    {},
  );
  const csvRows = chosen.map((row) => ({
    ...row,
    name: documents.find((d) => d.id === row.documentId)?.name || "Receipt",
  }));
  return (
    <WorkspaceScreen
      title="Receipt reports"
      subtitle="Review extracted amounts before adding them to a report."
    >
      <DocumentPicker
        title="Choose receipt"
        value={document}
        onSelect={(d) => {
          if (task.busy) return;
          selection.current=d.id;
          setDocument(d);
          setMerchant("");
          setDate("");
          setAmount("");
          void getReceipt(d.id)
            .then((row) => {
              if (row && selection.current===d.id) {
                setMerchant(row.merchant);
                setDate(row.date);
                setCurrency(row.currency);
                setAmount((row.cents / 100).toFixed(2));
              }
            })
            .catch(() => {});
        }}
      />
      <TaskStatus task={task} />
      <Button
        title="Suggest details using OCR"
        secondary
        disabled={!document || task.busy || !hasEngine}
        onPress={() =>
          task.run(async (signal, progress) => {
            const text =
              (await getText(document!.id)) ||
              (await recognizeDocument(document!, signal, progress)).text;
            const values = receiptSuggestion(text);
            setMerchant(values.merchant);
            setAmount(values.amount);
            setDate(values.date);
          })
        }
      />
      <Field label="Merchant" value={merchant} onChangeText={setMerchant} />
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <Field
        label="Currency (three-letter code)"
        value={currency}
        onChangeText={setCurrency}
      />
      <Field
        label="Total amount · use decimal point"
        value={amount}
        onChangeText={setAmount}
        numeric
      />
      <Button
        title="Save reviewed receipt"
        disabled={
          !document ||
          task.busy ||
          !merchant.trim() ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !/^[A-Za-z]{3}$/.test(currency)
        }
        onPress={() =>
          task.run(async () => {
            if (new Date(date).toISOString().slice(0, 10) !== date)
              throw new Error("Invalid date");
            await putReceipt({
              documentId: document!.id,
              merchant: merchant.trim().slice(0, 80),
              date,
              currency: currency.toUpperCase(),
              cents: parseAmount(amount),
            });
            await putFolder(document!.id, "Receipts");
            reload();
            Alert.alert(
              "Receipt saved",
              "Select it below to include it in a report.",
            );
          })
        }
      />
      <Section title="Choose receipts for your report" />
      {rows.map((row) => (
        <Card key={row.documentId} style={{ gap: 8 }}>
          <Label>
            {row.merchant} · {row.date}
          </Label>
          <Label>
            {row.currency} {(row.cents / 100).toFixed(2)}
          </Label>
          <Button
            secondary
            title={
              selected.includes(row.documentId)
                ? "✓ Included · tap to remove"
                : "Include in report"
            }
            disabled={task.busy}
            onPress={() =>
              setSelected((old) =>
                old.includes(row.documentId)
                  ? old.filter((id) => id !== row.documentId)
                  : [...old, row.documentId],
              )
            }
          />
        </Card>
      ))}
      {Object.entries(totals).map(([code, cents]) => (
        <Label key={code}>
          Total {code}: {(cents / 100).toFixed(2)}
        </Label>
      ))}
      <Label>
        Currencies are totaled separately. No exchange rates or automatic
        currency conversion.
      </Label>
      <Button
        title="Export CSV"
        disabled={!chosen.length || task.busy}
        onPress={() =>
          task.run(async () => {
            const dir = new Directory(Paths.document, "ScanDoc", "Exports");
            dir.create({ idempotent: true, intermediates: true });
            const file = new File(dir, `Expenses_${Crypto.randomUUID()}.csv`);
            file.write(receiptCsv(csvRows));
            await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
          })
        }
      />
      <Button
        title="Create PDF report with receipts"
        disabled={!chosen.length || task.busy || !hasEngine}
        onPress={() =>
          task.run(async (signal, progress) => {
            const cleanups: (() => void)[] = [];
            const reportUris: string[] = [];
            try {
              const lines = [
                "ScanDoc expense report",
                ...Object.entries(totals).map(
                  ([code, cents]) =>
                    `Total ${code}: ${(cents / 100).toFixed(2)}`,
                ),
                "",
                ...csvRows.flatMap((row) => [
                  `${row.date}  ${row.currency} ${(row.cents / 100).toFixed(2)}`,
                  row.merchant,
                  "",
                ]),
              ];
              for (let i = 0; i < lines.length; i += 36) {
                const output = await runEngine(
                  "reportPage",
                  { lines: lines.slice(i, i + 36) },
                  { signal },
                );
                cleanups.push(output.clean);
                reportUris.push(output.uri!);
              }
              const append = async (index: number): Promise<void> => {
                if (index < chosen.length) {
                  const source = documents.find(
                    (d) => d.id === chosen[index].documentId,
                  );
                  if (!source) throw new Error("Receipt missing");
                  await withDocumentPages(
                    source,
                    signal,
                    progress,
                    async (uris) => {
                      reportUris.push(...uris);
                      await append(index + 1);
                    },
                  );
                } else {
                  const pdf = await runEngine(
                    "pdf",
                    { uris: reportUris },
                    { signal, progress },
                  );
                  try {
                    const saved = await storePdf(
                      pdf.uri!,
                      `Expense_Report_${Date.now()}.pdf`,
                      reportUris.length,
                    );
                    await refresh();
                    router.push({
                      pathname: "/document/[id]",
                      params: { id: saved.id },
                    });
                  } finally {
                    pdf.clean();
                  }
                }
              };
              await append(0);
            } finally {
              cleanups.forEach((clean) => clean());
            }
          })
        }
      />
    </WorkspaceScreen>
  );
}
