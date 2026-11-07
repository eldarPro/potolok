import type jsPDF from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// In the installed app the WebView can neither share a File nor download a
// blob link, so the PDF is written to the app's cache and handed to the
// system share sheet (Telegram, WhatsApp, mail, «Save to Files»…). In a
// browser: the Web Share API where it takes files, else a plain download.

const cancelled = (e: unknown) => /cancel|abort/i.test(String((e as Error)?.message ?? e));

async function shareNative(doc: jsPDF, fileName: string, title: string) {
  const data = doc.output('datauristring').split(',')[1];
  const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  try {
    await Share.share({ title, dialogTitle: title, files: [uri] });
  } catch (e) {
    if (!cancelled(e)) throw e;
  }
}

/** Open the share sheet with the PDF attached */
export async function sharePdf(doc: jsPDF, fileName: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) return shareNative(doc, fileName, title);
  const file = new File([doc.output('blob')], fileName, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
    } catch (e) {
      if (!cancelled(e)) throw e;
    }
  } else {
    doc.save(fileName);
  }
}

/** Save the PDF: a download in a browser; in the app, the share sheet — its «Save to Files» is the way to keep a file there */
export async function savePdf(doc: jsPDF, fileName: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) return shareNative(doc, fileName, title);
  doc.save(fileName);
}
