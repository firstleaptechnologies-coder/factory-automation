import { Alert, Platform } from 'react-native';
import { generatePDF } from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { api } from '../api/client';

/**
 * Turning a document into a PDF and handing it to whoever the user picks.
 *
 * The HTML comes from the server so the app, the web and anything printed later
 * are the same document with the same totals; the conversion happens on the
 * device so sending an estimate is one tap and works on a site with no signal
 * to speak of.
 */
export async function shareDocument(options: {
  /** Server path that returns the document HTML. */
  path: string;
  /** Becomes the PDF's filename, so use the document number. */
  fileName: string;
  /** Prefilled message; WhatsApp shows it beside the attachment. */
  message?: string;
  /** Skips the share sheet and goes straight to this number on WhatsApp. */
  phone?: string;
}): Promise<boolean> {
  const html = await api.fetchText(options.path);

  const pdf = await generatePDF({
    html,
    fileName: options.fileName,
    // A4 at 72dpi. The document's own CSS is written in millimetres, so this
    // only has to be the right shape.
    width: 595,
    height: 842,
    padding: 0,
    base64: false,
    bgColor: '#FFFFFF',
    // Without this the coloured table headers and the total bar print as
    // white — the document would come out looking broken.
    shouldPrintBackgrounds: true,
  });

  if (!pdf.filePath) {
    Alert.alert('Could not build the PDF', 'The document could not be rendered.');
    return false;
  }

  const url = Platform.OS === 'android' ? `file://${pdf.filePath}` : pdf.filePath;

  try {
    if (options.phone) {
      await Share.shareSingle({
        social: Share.Social.WHATSAPP as never,
        url,
        type: 'application/pdf',
        message: options.message,
        // WhatsApp wants the country code and no punctuation.
        whatsAppNumber: options.phone.replace(/[^\d]/g, ''),
        filename: options.fileName,
      } as never);
    } else {
      await Share.open({
        url,
        type: 'application/pdf',
        message: options.message,
        filename: options.fileName,
        failOnCancel: false,
      });
    }
    return true;
  } catch (error) {
    // Dismissing the share sheet is not a failure worth an alert.
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message)) return false;
    Alert.alert('Could not share', message);
    return false;
  }
}
