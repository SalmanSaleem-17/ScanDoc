import { useCallback, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Label,
  Loading,
  Screen,
  Section,
  type IconName,
} from "../../src/components/ui";
import { useDocuments } from "../../src/features/documents/provider";
import { useImport } from "../../src/features/documents/useImport";
import { DocumentCard } from "../../src/features/documents/DocumentCard";
import { listDrafts } from "../../src/services/workspace";

// Home is deliberately short: scan, the four next-most-common actions, a way
// back into unfinished scans when there are any, and the latest documents.
export default function Home() {
  const { documents, loading, error, refresh } = useDocuments();
  const { importDocuments, progress } = useImport();
  const [drafts, setDrafts] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      listDrafts()
        .then((rows) => {
          if (live) setDrafts(rows.length);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );
  const recent = documents.filter((d) => !d.trashedAt).slice(0, 4);
  const quickActions: {
    title: string;
    icon: IconName;
    onPress: () => void;
    disabled?: boolean;
  }[] = [
    {
      title: "Import files",
      icon: "download-outline",
      onPress: importDocuments,
      disabled: !!progress,
    },
    { title: "Read text", icon: "text-outline", onPress: () => router.push("/ocr") },
    { title: "Merge PDFs", icon: "git-merge-outline", onPress: () => router.push("/merge") },
    { title: "Compress", icon: "contract-outline", onPress: () => router.push("/compress") },
  ];
  return (
    <Screen tabScreen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <Image
          source={require("../../assets/icon.png")}
          style={{ width: 36, height: 36, borderRadius: 10 }}
        />
        <Label
          accessibilityRole="header"
          style={{
            fontSize: 22,
            fontWeight: "700",
            letterSpacing: -0.6,
            flex: 1,
          }}
        >
          ScanDoc
        </Label>
        <IconButton
          name="search-outline"
          label="Search documents"
          onPress={() => router.push("/documents")}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a document with your camera"
        onPress={() => router.push("/scanner")}
      >
        <LinearGradient
          colors={["#075FE4", "#063EAA"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20,
            padding: 22,
            minHeight: 150,
            overflow: "hidden",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              padding: 10,
              backgroundColor: "#FFFFFF20",
              borderRadius: 12,
              alignSelf: "flex-start",
            }}
          >
            <Icon name="scan-outline" color="white" size={28} />
          </View>
          <View>
            <Label
              style={{
                color: "white",
                fontSize: 24,
                lineHeight: 32,
                fontWeight: "600",
                marginTop: 16,
              }}
            >
              Scan a document
            </Label>
            <Label style={{ color: "#D2E8FF", fontSize: 13, marginTop: 2 }}>
              Pages are saved as you go and stay on this phone.
            </Label>
          </View>
        </LinearGradient>
      </Pressable>
      <View style={{ gap: 12, marginTop: 12 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {quickActions.map((action) => (
            <View
              key={action.title}
              style={{ flexBasis: "46%", flexGrow: 1, minWidth: 132 }}
            >
              <Button
                secondary
                title={action.title}
                icon={action.icon}
                onPress={action.onPress}
                disabled={action.disabled}
              />
            </View>
          ))}
        </View>
        {drafts > 0 && (
          <Button
            secondary
            title={`Resume ${drafts} unfinished ${drafts === 1 ? "scan" : "scans"}`}
            icon="layers-outline"
            onPress={() => router.push("/workspace")}
          />
        )}
        {progress && <Loading text={progress} />}
      </View>
      <Section
        title="Recent"
        action={recent.length ? "See all" : undefined}
        onPress={() => router.push("/documents")}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <EmptyState
          title="Library unavailable"
          description={error}
          action={<Button title="Try again" onPress={refresh} />}
        />
      ) : recent.length ? (
        recent.map((document) => (
          <DocumentCard key={document.id} document={document} />
        ))
      ) : (
        <EmptyState
          title="No documents yet"
          description="Scan a page or import a PDF to get started."
          action={
            <Button
              title="Import a document"
              secondary
              onPress={importDocuments}
            />
          }
        />
      )}
    </Screen>
  );
}
