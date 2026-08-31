/** Read a Firebird BLOB returned by the pure JavaScript driver. */
export function readBlobField(field: any): Promise<string | null> {
    return new Promise((resolve, reject) => {
        if (field == null) return resolve(null);
        if (typeof field === 'string') return resolve(field);
        if (Buffer.isBuffer(field)) return resolve(field.toString('utf8'));

        if (typeof field === 'function') {
            field((err: Error | null, _name: string, event: any) => {
                if (err) return reject(err);
                const chunks: Buffer[] = [];
                event.on('data', (chunk: Buffer) => chunks.push(chunk));
                event.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                event.on('error', reject);
            });
            return;
        }

        // Native Blob objects contain their attachment and must never be
        // serialized or converted with String(), which can expose internals.
        if (typeof field === 'object') return reject(new Error('Unresolved Firebird BLOB object'));
        resolve(String(field));
    });
}

/** Resolve pure-driver BLOB columns, inspecting all rows instead of only row 0. */
export async function resolveBlobFields(rows: any[]): Promise<any[]> {
    if (rows.length === 0) return rows;

    const blobKeys = new Set<string>();
    for (const row of rows) {
        for (const [key, value] of Object.entries(row)) {
            if (typeof value === 'function' || Buffer.isBuffer(value)) blobKeys.add(key);
        }
    }
    if (blobKeys.size === 0) return rows;

    return Promise.all(rows.map(async row => {
        const resolved = { ...row };
        await Promise.all(Array.from(blobKeys).map(async key => {
            resolved[key] = await readBlobField(row[key]);
        }));
        return resolved;
    }));
}

function isNativeBlob(value: any): boolean {
    return value !== null &&
        typeof value === 'object' &&
        value.id !== undefined &&
        value.attachment !== null &&
        typeof value.attachment === 'object' &&
        typeof value.attachment.openBlob === 'function';
}

/** Resolve native-driver Blob objects before their transaction is closed. */
export async function resolveNativeBlobFields(rows: any[], transaction: any): Promise<any[]> {
    const resolvedRows: any[] = [];
    for (const row of rows) {
        const resolved = { ...row };
        for (const [key, value] of Object.entries(row)) {
            if (!isNativeBlob(value)) continue;

            const blobStream = await (value as any).attachment.openBlob(transaction, value);
            const chunks: Buffer[] = [];
            try {
                while (true) {
                    const buffer = Buffer.allocUnsafe(65535);
                    const bytesRead = await blobStream.read(buffer);
                    if (bytesRead <= 0) break;
                    chunks.push(buffer.subarray(0, bytesRead));
                }
                resolved[key] = Buffer.concat(chunks).toString('utf8');
            } finally {
                await blobStream.close();
            }
        }
        resolvedRows.push(resolved);
    }
    return resolvedRows;
}
