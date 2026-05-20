import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { processWorkbook, SPREADSHEET_URL } from '../src/App.tsx';

function initFirebaseAdmin(): boolean {
  if (admin.apps.length > 0) return true;

  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    resolve('firebase-service-account.json'),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    if (existsSync(path)) {
      const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId,
      });
      return true;
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      projectId: firebaseConfig.projectId,
    });
    return true;
  }

  return false;
}

async function main() {
  console.log('Baixando planilha...');
  const response = await fetch(SPREADSHEET_URL);
  if (!response.ok) {
    throw new Error(`Falha ao buscar planilha (${response.status}). Verifique se está pública.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  console.log('Processando dados...');
  const metrics = await processWorkbook(wb);

  const newData = {
    ...metrics,
    updatedAt: new Date().toISOString(),
    updatedBy: 'CLI Sync',
  };

  const gt = metrics.inventarioGT;

  if (!initFirebaseAdmin()) {
    const outPath = resolve('sync-output.json');
    writeFileSync(outPath, JSON.stringify(newData));
    console.log('Planilha processada; Firestore não atualizado (sem credenciais admin).');
    console.log(`  Backup local: ${outPath}`);
    console.log(`  SKUs: ${gt?.uniqueSKUCount ?? 0} | FEFO: ${gt?.fefoCount ?? 0} | PERDA: ${gt?.perdaCount ?? 0}`);
    process.exit(1);
  }

  const db = getFirestore(
    admin.app(),
    firebaseConfig.firestoreDatabaseId || '(default)'
  );

  try {
    console.log('Gravando no Firestore...');
    await db.collection('dashboard').doc('latest').set(newData);
    console.log('Sync concluído.');
    console.log(`  SKUs: ${gt?.uniqueSKUCount ?? 0}`);
    console.log(`  FEFO: ${gt?.fefoCount ?? 0}`);
    console.log(`  PERDA: ${gt?.perdaCount ?? 0}`);
    console.log(`  Atualizado em: ${newData.updatedAt}`);
  } catch (err) {
    const outPath = resolve('sync-output.json');
    writeFileSync(outPath, JSON.stringify(newData));
    console.error('Firestore:', err instanceof Error ? err.message : err);
    console.log('Planilha processada; backup local gravado.');
    console.log(`  Arquivo: ${outPath}`);
    console.log(`  SKUs: ${gt?.uniqueSKUCount ?? 0} | FEFO: ${gt?.fefoCount ?? 0} | PERDA: ${gt?.perdaCount ?? 0}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Sync falhou:', err instanceof Error ? err.message : err);
  process.exit(1);
});
