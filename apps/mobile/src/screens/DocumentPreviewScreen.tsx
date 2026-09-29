import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { shareDocument } from '../lib/documents';
import { Button, EmptyState, Loader, RoundButton, ScreenHeader, haptic } from '../ui';
import { palette, spacing } from '../theme';

/**
 * A printed document, read on the phone before it is sent.
 *
 * Every document in the product — the quotation, the invoice, the challan, a
 * priced enquiry — is rendered as HTML by the server and turned into a PDF on
 * the device. Until now the only way to look at one was to share it and open
 * whatever came out the other end, which means the first person to see a
 * document is the client.
 *
 * So the same HTML is shown here, unaltered. Not a second layout that
 * approximates the paper: the actual markup the PDF is made from, which is
 * the only way a preview can honestly claim to be one. Sharing from this
 * screen converts that same markup, so what was read is what is sent.
 */
export function DocumentPreviewScreen({ route, navigation }: { route: any; navigation: any }) {
  const { path, title, subtitle, fileName, message, phone } = route.params as {
    /** Server path returning the document HTML. */
    path: string;
    title: string;
    subtitle?: string;
    /** Becomes the PDF's filename, so it is the document number. */
    fileName: string;
    message?: string;
    phone?: string;
  };

  const document = useApi<string>(() => api.fetchText(path), [path]);
  const [sharing, setSharing] = useState(false);
  const insets = useSafeAreaInsets();

  const share = async () => {
    setSharing(true);
    try {
      const sent = await shareDocument({ path, fileName, message, phone });
      if (sent) haptic('notificationSuccess');
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          onBack={() => navigation.goBack()}
          right={
            <RoundButton
              icon="arrowUpRight"
              testID="share-button"
              accessibilityLabel="Share"
              onPress={share}
            />
          }
        />
      </View>

      {document.loading && !document.data ? (
        <Loader label="Building the document" />
      ) : document.error || !document.data ? (
        <EmptyState
          icon="receipt"
          title="Could not build it"
          message={document.error ?? 'The document could not be rendered.'}
        />
      ) : (
        <WebView
          testID="document-webview"
          originWhitelist={['*']}
          /*
           * The markup is served by our own API and inlines its letterhead as
           * a data URI, so there is nothing for it to fetch. Kept that way on
           * purpose: a preview that reaches out to the network is a preview
           * that looks different on a site with no signal, and this is read
           * in workshops.
           */
          source={{ html: document.data }}
          style={styles.web}
          containerStyle={styles.webContainer}
          /*
           * After the content loads, not before.
           *
           * The document carries its own `<meta viewport>` — it has to, it is
           * also served to a browser — and a meta appended before the page
           * parses is simply overridden by the one in the markup. Injected
           * first, the sheet rendered at its true A4 width and the reader saw
           * the left two-thirds of it: the Amount column and the totals block
           * were off the right edge.
           */
          injectedJavaScript={FIT_TO_WIDTH}
          /* Android will not run injected JS without a message handler. */
          onMessage={ignoreMessages}
        />
      )}

      <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title="Share as PDF" size="lg" loading={sharing} onPress={share} />
      </View>
    </View>
  );
}

/** The page sends us nothing; the handler exists so Android runs the script. */
const ignoreMessages = (): void => undefined;

/**
 * Fit the sheet to the phone, and let it be pinched larger.
 *
 * The document is laid out in millimetres for A4 — 210mm is 794 CSS pixels —
 * so at a phone's width it has to be scaled down or it is read one third at a
 * time. The page's own viewport meta is replaced rather than a second one
 * added: two of them and the one in the markup wins.
 *
 * `maximum-scale` is deliberately not 1. This is a document somebody checks
 * before sending it to a client, and an HSN code at 55% is not checkable.
 */
const FIT_TO_WIDTH = `
  (function () {
    var A4 = 794;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=' + A4 + ', initial-scale=' + (window.screen.width / A4) +
        ', minimum-scale=' + (window.screen.width / A4) +
        ', maximum-scale=3, user-scalable=yes',
    );
  })();
  true;
`;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  header: { paddingHorizontal: spacing.lg },
  /* White, because the page inside is paper and a dark gutter reads as a gap. */
  web: { flex: 1, backgroundColor: '#FFFFFF' },
  webContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
