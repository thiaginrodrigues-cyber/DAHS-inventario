const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1tnl6iGFhO87pd0wYPnmOVoCSXJp10xwvSqagHrwTr-s/export?format=xlsx';

async function run() {
  try {
    const res = await fetch(SPREADSHEET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const wb = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = wb.SheetNames.find(n => n && n.toUpperCase().normalize('NFD').replace(/\u0300-\u036f/g, '').includes('INVENTARIO GT'))
      || wb.SheetNames.find(n => n && n.toUpperCase().includes('INVENTARIO'))
      || wb.SheetNames[0];

    console.log('Usando aba:', sheetName);
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    console.log('Total de linhas (inclui header):', data.length);

    const header = data[0] || [];
    console.log('Cabeçalho (primeiras 30 colunas):', header.slice(0, 30));

    // Show sample rows
    const rowsToShow = Math.min(10, data.length - 1);
    console.log('\nAmostra de linhas (índices de coluna relevantes: 1=B, 2=C, 10=K, 69=BQ, 173=??, 199=GR):');
    for (let i = 1; i <= rowsToShow; i++) {
      const r = data[i] || [];
      const position = r[1];
      const area = r[2];
      const sku = r[10];
      const expirationRaw = r[68];
      const val69 = r[69];
      const val173 = r[173];
      const val199 = r[199];
      console.log(i, { position, area, sku, expirationRaw, val69, val173, val199 });
    }

  } catch (err) {
    console.error('Erro ao ler planilha:', err);
    process.exitCode = 1;
  }
}

run();
