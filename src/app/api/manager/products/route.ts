// src/app/api/manager/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';

// This should match the frontend's FIXED_PRODUCT_FIELDS_CONFIG structure or just names/types
// For backend, we mainly need the names and types for validation/conversion
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


// POST - Create a new product
export async function POST(req: NextRequest) {
  console.log("API POST /api/manager/products called");
  try {
    const body = await req.json();
    const { articleNumber, articleName } = body;

    if (!articleNumber || typeof articleNumber !== 'string' || articleNumber.trim() === '') {
        return NextResponse.json({ message: 'Article Number is required as a non-empty string.' }, { status: 400 });
    }
    if (!articleName || typeof articleName !== 'string' || articleName.trim() === '') {
      return NextResponse.json({ message: 'Article Name is required as a non-empty string.' }, { status: 400 });
    }

    const trimmedArticleNumber = articleNumber.trim();
    const productRef = db.collection('product').doc(trimmedArticleNumber);
    const doc = await productRef.get();
    if (doc.exists) {
      return NextResponse.json({ message: `Product with Article Number "${trimmedArticleNumber}" already exists.` }, { status: 409 });
    }

    const newProductData: {[key: string]: any} = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    for (const fieldDef of PRODUCT_FIELD_DEFINITIONS) {
        const value = body[fieldDef.name];

        if (fieldDef.required) {
            if (fieldDef.name === 'articleNumber') {
                newProductData[fieldDef.name] = trimmedArticleNumber;
            } else if (fieldDef.name === 'articleName') {
                newProductData[fieldDef.name] = articleName.trim();
            }
            // Validation for required already done above
        } else {
            // Optional fields
            if (value === undefined || value === null || String(value).trim() === '') {
                newProductData[fieldDef.name] = null;
            } else if (fieldDef.type === 'number') {
                const numVal = Number(value);
                if (isNaN(numVal)) {
                    // Allow null to be passed explicitly for numbers
                    if (value === null) {
                        newProductData[fieldDef.name] = null;
                    } else {
                        return NextResponse.json({ message: `Field '${fieldDef.name}' must be a valid number or null. Received: ${value}` }, { status: 400 });
                    }
                } else {
                    newProductData[fieldDef.name] = numVal;
                }
            } else { // string
                newProductData[fieldDef.name] = String(value).trim();
            }
        }
    }
    
    await productRef.set(newProductData);
    console.log("New product created with Article Number:", trimmedArticleNumber);

    return NextResponse.json({ 
        message: `Product "${newProductData.articleName}" (ID: ${trimmedArticleNumber}) created successfully.`, 
        id: trimmedArticleNumber, 
        data: newProductData 
    }, { status: 201 });

  } catch (error: any) {
    console.error("Error creating product:", error);
    if (error.message.includes("Document path must be a non-empty string")) { 
        return NextResponse.json({ message: 'Invalid Article Number format.', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: 'Failed to create product.', details: error.message }, { status: 500 });
  }
}

// GET - List all products
export async function GET(req: NextRequest) {
  console.log("API GET /api/manager/products called");
  try {
    const snapshot = await db.collection('product').orderBy('articleName', 'asc').get();
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(products);
  } catch (error: any) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ message: 'Failed to fetch products', details: error.message }, { status: 500 });
  }
}