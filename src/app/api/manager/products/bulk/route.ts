// src/app/api/manager/products/bulk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

// Match frontend's FIXED_PRODUCT_FIELDS_CONFIG names and types
const PRODUCT_FIELD_DEFINITIONS = [
  { name: 'articleNumber', type: 'string', required: true },
  { name: 'articleName', type: 'string', required: true },
  { name: 'posDescription', type: 'string', required: false },
  { name: 'metlerCode', type: 'string', required: false },
  { name: 'hsnCode', type: 'string', required: false },
  { name: 'taxPercentage', type: 'number', required: false },
  { name: 'purchasePricePerKg', type: 'number', required: false },
  { name: 'sellingRatePerKg', type: 'number', required: false },
  { name: 'mrpPer100g', type: 'number', required: false },
  { name: 'remark', type: 'string', required: false },
];

interface BulkProductPayloadItem {
    articleNumber: string;
    articleName: string;
    [key: string]: any; // Other fixed fields
}

export async function POST(req: NextRequest) {
  console.log("API POST /api/manager/products/bulk called");
  try {
    const productsPayload = await req.json() as BulkProductPayloadItem[];

    if (!Array.isArray(productsPayload) || productsPayload.length === 0) {
      return NextResponse.json({ message: 'Request body must be a non-empty array of products.' }, { status: 400 });
    }

    const productsCollection = db.collection('product');
    const results: { articleNumber: string; success: boolean; message?: string }[] = [];
    
    const MAX_FIRESTORE_WRITE_BATCH_SIZE = 490; // For batch.set() operations
    const MAX_IN_QUERY_VALUES = 29; // Firestore 'in' query limit is 30, use 29 for safety

    for (let i = 0; i < productsPayload.length; i += MAX_FIRESTORE_WRITE_BATCH_SIZE) {
        const payloadChunk = productsPayload.slice(i, i + MAX_FIRESTORE_WRITE_BATCH_SIZE);
        const firestoreWriteBatch = db.batch();
        let operationsInCurrentFirestoreWriteBatch = 0;

        const chunkProcessingStatus = new Map<string, { success: boolean; message?: string; dataToSet?: any }>();

        // Pass 1: Basic validation and prepare data for items in this payloadChunk
        for (const product of payloadChunk) {
            const articleNumber = String(product.articleNumber || '').trim();
            const articleName = String(product.articleName || '').trim();

            if (!articleNumber) {
                // Use a unique key if articleNumber is missing to avoid overwriting in map
                const uniqueKey = product.articleNumber || `InvalidItem_Index${i + chunkProcessingStatus.size}`;
                chunkProcessingStatus.set(uniqueKey, { success: false, message: 'Missing or invalid articleNumber.' });
                continue;
            }
            if (!articleName) {
                chunkProcessingStatus.set(articleNumber, { success: false, message: 'Missing or invalid articleName.' });
                continue;
            }
            if (chunkProcessingStatus.has(articleNumber) && chunkProcessingStatus.get(articleNumber)?.dataToSet) {
                 chunkProcessingStatus.set(articleNumber, { success: false, message: `Duplicate articleNumber '${articleNumber}' within processing batch.` });
                 continue;
            }

            const productData: {[key: string]: any} = {
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            let fieldError = false;

            for (const fieldDef of PRODUCT_FIELD_DEFINITIONS) {
                const value = product[fieldDef.name];
                if (fieldDef.name === 'articleNumber') {
                    productData[fieldDef.name] = articleNumber;
                } else if (fieldDef.name === 'articleName') {
                    productData[fieldDef.name] = articleName;
                } else {
                    if (value === undefined || value === null || String(value).trim() === '') {
                        productData[fieldDef.name] = null;
                    } else if (fieldDef.type === 'number') {
                        const numVal = Number(value);
                        if (isNaN(numVal)) {
                            if (value === null) productData[fieldDef.name] = null;
                            else {
                                chunkProcessingStatus.set(articleNumber, { success: false, message: `Invalid number for '${fieldDef.name}': ${value}` });
                                fieldError = true; break;
                            }
                        } else {
                            productData[fieldDef.name] = numVal;
                        }
                    } else {
                        productData[fieldDef.name] = String(value).trim();
                    }
                }
            }
            if (fieldError) continue;
            chunkProcessingStatus.set(articleNumber, { success: true, dataToSet: productData });
        }

        // Pass 2: Check Firestore for existing IDs using chunked 'in' queries
        const validIdsForDbCheck = Array.from(chunkProcessingStatus.keys()).filter(id => chunkProcessingStatus.get(id)?.success);
        
        if (validIdsForDbCheck.length > 0) {
            for (let j = 0; j < validIdsForDbCheck.length; j += MAX_IN_QUERY_VALUES) {
                const idsSubChunk = validIdsForDbCheck.slice(j, j + MAX_IN_QUERY_VALUES);
                if (idsSubChunk.length > 0) {
                    const existingDocsSnap = await productsCollection.where(admin.firestore.FieldPath.documentId(), 'in', idsSubChunk).get();
                    existingDocsSnap.docs.forEach(doc => {
                        if (chunkProcessingStatus.has(doc.id)) {
                            chunkProcessingStatus.set(doc.id, { success: false, message: 'Article Number already exists in database.' });
                        }
                    });
                }
            }
        }
        
        // Pass 3: Add to Firestore write batch
        chunkProcessingStatus.forEach((status, id) => {
            if (status.success && status.dataToSet) {
                const docRef = productsCollection.doc(id);
                firestoreWriteBatch.set(docRef, status.dataToSet);
                operationsInCurrentFirestoreWriteBatch++;
            }
        });
        
        if (operationsInCurrentFirestoreWriteBatch > 0) {
            await firestoreWriteBatch.commit();
        }
        
        // Aggregate results from this chunk
        chunkProcessingStatus.forEach((status, id) => {
            results.push({ 
                articleNumber: id, // id here is the articleNumber or the generated key for invalid items
                success: status.success, 
                message: status.message || (status.success ? 'Successfully added.' : 'Skipped or failed pre-check.') 
            });
        });
    }
    
    const overallSuccessCount = results.filter(r => r.success && r.message === 'Successfully added.').length;
    const status = overallSuccessCount === productsPayload.length ? 201 : (overallSuccessCount > 0 ? 207 : 400);

    return NextResponse.json({ 
        message: `${overallSuccessCount} products added. ${productsPayload.length - overallSuccessCount} products failed or were skipped.`,
        results 
    }, { status });

  } catch (error: any) {
    console.error("Error in bulk product add:", error);
    let errorMessage = 'Failed to process bulk product add.';
    if (error.details) { // For Firestore specific errors
        errorMessage += ` Details: ${error.details}`;
    } else if (error.message) {
        errorMessage += ` Message: ${error.message}`;
    }
    return NextResponse.json({ message: errorMessage, fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)) }, { status: 500 });
  }
}