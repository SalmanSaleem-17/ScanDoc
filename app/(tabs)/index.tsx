import { Image, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  IconButton,
  Label,
  Loading,
  Screen,
  Section,
} from "../../src/components/ui";
import { useTheme } from "../../src/theme/provider";
import { useDocuments } from "../../src/features/documents/provider";
import { useImport } from "../../src/features/documents/useImport";
import { DocumentCard } from "../../src/features/documents/DocumentCard";
export default function Home() {
  const { colors } = useTheme();
  const { documents, loading, error, refresh } = useDocuments();
  const { importDocuments, progress } = useImport();
  const recent = documents.filter((d) => !d.trashedAt).slice(0, 3);
  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 28,
        }}
      >
        <Image
          source={require("../../assets/icon.png")}
          style={{ width: 38, height: 38, borderRadius: 10 }}
        />
        <Label
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
      <Header
        title="Less paperwork. More done."
        subtitle="Your everyday document workspace."
      />
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
            padding: 24,
            minHeight: 174,
            overflow: "hidden",
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <View
              style={{
                padding: 10,
                backgroundColor: "#FFFFFF20",
                borderRadius: 12,
              }}
            >
              <Icon name="scan-outline" color="white" size={29} />
            </View>
            <Icon name="arrow-up-right-box-outline" color="#A9DDFF" size={23} />
          </View>
          <Label
            style={{
              color: "white",
              fontSize: 24,
              lineHeight: 32,
              fontWeight: "600",
              marginTop: 18,
            }}
          >
            Scan Document
          </Label>
          <Label style={{ color: "#D2E8FF", fontSize: 13, marginTop: 4 }}>
            Capture a page. Keep it close.
          </Label>
        </LinearGradient>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            title="Import files"
            icon="download-outline"
            onPress={importDocuments}
            disabled={!!progress}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            title="Compress"
            icon="contract-outline"
            onPress={() => router.push("/compress")}
          />
        </View>
      </View>
      {progress && <Loading text={progress} />}
      <Button
        secondary
        title="Resume scans & quick workflows"
        icon="layers-outline"
        onPress={() => router.push("/workspace")}
      />
      <Section
        title="Recent documents"
        action="See all"
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
          action={
            <Button
              title="Import a document"
              secondary
              onPress={importDocuments}
            />
          }
        />
      )}
      <Section title="Made for your everyday" />
      <Card style={{ flexDirection: "row", gap: 14 }}>
        <Icon
          name="shield-checkmark-outline"
          color={colors.success}
          size={26}
        />
        <View style={{ flex: 1 }}>
          <Label style={{ fontWeight: "600", fontSize: 14 }}>
            Your documents stay on your device.
          </Label>
          <Label
            style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}
          >
            No account. No uploads. Just your work.
          </Label>
        </View>
      </Card>
    </Screen>
  );
}
