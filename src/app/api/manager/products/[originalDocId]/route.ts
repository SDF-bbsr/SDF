// src/app/api/manager/products/[originalDocId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

// Re-use or define product field definitions similar to POST route
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


// PUT - Update an existing product OR change its ID (Article Number)
export async function PUT(req: NextRequest, { params }: { params: { originalDocId: string } }) {
  const currentArticleNumber = params.originalDocId; 
  console.log(`API PUT /api/manager/products/${currentArticleNumber} called`);

  try {
    const body = await req.json();
    // newArticleNumber is sent if user intends to change the document ID / articleNumber field
    const { newArticleNumber, articleName, ...otherDataFromPayload } = body; 

    if (!currentArticleNumber) {
      return NextResponse.json({ message: 'Original Article Number (ID) is required in path.' }, { status: 400 });
    }
    if (!articleName || typeof articleName !== 'string' || articleName.trim() === '') {
      return NextResponse.json({ message: 'Article Name is required as a non-empty string.' }, { status: 400 });
    }
    
    const proposedArticleNumber = (newArticleNumber && String(newArticleNumber).trim() !== '') 
                                 ? String(newArticleNumber).trim() 
                                 : currentArticleNumber;

    if (!proposedArticleNumber || typeof proposedArticleNumber !== 'string' || proposedArticleNumber.trim() === '') {
      return NextResponse.json({ message: 'Article Number must be a non-empty string.' }, { status: 400 });
    }

    const productDataToSave: {[key: string]: any} = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    for (const fieldDef of PRODUCT_FIELD_DEFINITIONS) {
        const value = body[fieldDef.name]; // Value from payload for this field

        if (fieldDef.name === 'articleNumber') {
            productDataToSave[fieldDef.name] = proposedArticleNumber; // Always set articleNumber field to the final ID
            continue;
        }
        if (fieldDef.name === 'articleName') {
            productDataToSave[fieldDef.name] = articleName.trim();
            continue;
        }
        
        // For other (optional or not) fields from schema:
        // If field is in payload (body has property body[fieldDef.name]):
        if (Object.prototype.hasOwnProperty.call(body, fieldDef.name)) {
             if (value === undefined || value === null || String(value).trim() === '') {
                productDataToSave[fieldDef.name] = null;
            } else if (fieldDef.type === 'number') {
                const numVal = Number(value);
                if (isNaN(numVal)) {
                    if (value === null) { // Allow explicit null
                        productDataToSave[fieldDef.name] = null;
                    } else {
                        return NextResponse.json({ message: `Field '${fieldDef.name}' must be a valid number or null. Received: ${value}` }, { status: 400 });
                    }
                } else {
                    productDataToSave[fieldDef.name] = numVal;
                }
            } else { // string
                productDataToSave[fieldDef.name] = String(value).trim();
            }
        } else {
            // Field NOT in payload. If using .set() for full overwrite, this field would be removed.
            // If we want to ensure all schema fields persist (even as null), we would add:
            // productDataToSave[fieldDef.name] = null;
            // However, client is expected to send all fields. If a field is missing, it implies it should be removed or kept as is by merge.
            // Since we use .set() for full replacement, if client doesn't send a field, it will be removed from doc.
            // To ensure schema fields are at least null, client form submit logic must send them as null if empty.
            // The current frontend logic does send all fields (empty ones as null), so this is fine.
        }
    }

    const productsCollection = db.collection('product');
    const originalDocRef = productsCollection.doc(currentArticleNumber);
    const originalDocSnap = await originalDocRef.get();

    if (!originalDocSnap.exists) {
      return NextResponse.json({ message: `Product with original Article Number "${currentArticleNumber}" not found.` }, { status: 404 });
    }
    const originalData = originalDocSnap.data() || {};
    productDataToSave.createdAt = originalData.createdAt || admin.firestore.FieldValue.serverTimestamp(); // Preserve original createdAt

    // Handle ID Change: If proposedArticleNumber is different from currentArticleNumber
    if (proposedArticleNumber !== currentArticleNumber) {
      const targetDocRef = productsCollection.doc(proposedArticleNumber);
      const targetDocSnap = await targetDocRef.get();

      if (targetDocSnap.exists) {
        return NextResponse.json({ message: `Cannot change Article Number: Product with new Article Number "${proposedArticleNumber}" already exists.` }, { status: 409 });
      }

      const batch = db.batch();
      batch.set(targetDocRef, productDataToSave); // Create new doc with all data
      batch.delete(originalDocRef); // Delete the old document
      
      await batch.commit();
      console.log(`Product Article Number changed from ${currentArticleNumber} to ${proposedArticleNumber}`);
      return NextResponse.json({ 
          message: `Product Article Number changed from "${currentArticleNumber}" to "${proposedArticleNumber}" and data updated.`, 
          id: proposedArticleNumber, 
          data: productDataToSave 
      });

    } else {
      // Standard update (no ID change)
      await originalDocRef.set(productDataToSave); // Overwrite with new data
      console.log("Product updated:", currentArticleNumber);
      return NextResponse.json({ 
          message: `Product "${productDataToSave.articleName}" (ID: ${currentArticleNumber}) updated successfully.`, 
          id: currentArticleNumber, 
          data: productDataToSave 
      });
    }

  } catch (error: any) {
    console.error(`Error updating product ${params.originalDocId}:`, error);
    return NextResponse.json({ message: 'Failed to update product.', details: error.message }, { status: 500 });
  }
}

// DELETE - Delete a product
export async function DELETE(req: NextRequest, { params }: { params: { originalDocId: string } }) {
  const articleNumber = params.originalDocId;
  console.log(`API DELETE /api/manager/products/${articleNumber} called`);
  try {
    if (!articleNumber) {
      return NextResponse.json({ message: 'Article Number (ID) is required.' }, { status: 400 });
    }

    const productRef = db.collection('product').doc(articleNumber);
    const doc = await productRef.get();
    if (!doc.exists) {
      return NextResponse.json({ message: `Product with Article Number "${articleNumber}" not found.` }, { status: 404 });
    }

    await productRef.delete();
    console.log("Product deleted:", articleNumber);

    return NextResponse.json({ message: `Product with Article Number "${articleNumber}" deleted successfully.`, id: articleNumber });

  } catch (error: any) {
    console.error(`Error deleting product ${articleNumber}:`, error);
    return NextResponse.json({ message: 'Failed to delete product.', details: error.message }, { status: 500 });
  }
}