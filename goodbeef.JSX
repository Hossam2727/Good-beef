import React, { useState, useEffect, useMemo, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import {
  ShoppingCart,
  Beef,
  Truck,
  User,
  Loader2,
  Home,
  Info,
  Shield,
  PlusCircle,
  Trash2,
  Edit3,
  CheckCircle,
  X,
  Save,
  Layers,
  Clock,
  Settings,
  Key,
  Phone,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

// -------------------------------------------------------------------------
// الثوابت العامة وإعدادات الشحن
// -------------------------------------------------------------------------
const CURRENCY = "ج.م"; // العملة: الجنيه المصري
const WHATSAPP_NUMBER = "+20123456789"; // رقم الواتساب للتاجر

// مناطق الشحن وأسعارها
const SHIPPING_ZONES = [
  { id: "select", name: "اختر منطقة التوصيل", cost: 0.0 },
  { id: "karmouz", name: "المناطق الداخلية (كرموز، محطة الرمل)", cost: 40.0 },
  { id: "smouha", name: "المناطق الوسطى (سموحة، وسط الإسكندرية)", cost: 55.0 },
  { id: "amreya", name: "المناطق الخارجية (برج العرب، العامرية)", cost: 65.0 },
];

// تهيئة إعدادات Firebase
const appId =
  typeof __app_id !== "undefined" ? __app_id : "default-meat-store-app-id";
const firebaseConfig = JSON.parse(
  typeof __firebase_config !== "undefined" ? __firebase_config : "{}"
);
const initialAuthToken =
  typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;

// مسارات مجموعات Firestore
const getProductCollectionPath = (appId) =>
  `/artifacts/${appId}/public/data/products`;
const getCategoryCollectionPath = (appId) =>
  `/artifacts/${appId}/public/data/categories`;
const getOrderCollectionPath = (userId) =>
  `/artifacts/${appId}/users/${userId}/orders`;
const getAllOrdersCollectionPath = (appId) =>
  `/artifacts/${appId}/public/data/all_orders`;
const getAdminsCollectionPath = (appId) =>
  `/artifacts/${appId}/public/data/admins`;
const getCartDocPath = (userId) =>
  `/artifacts/${appId}/users/${userId}/cart/current`;

// بيانات أولية للمنتجات والأقسام (للتغذية الأولية عند الحاجة)
const initialProductsData = [
  {
    id: "ribeye",
    name: "ريب آي ستيك",
    description: "لحم بقري فاخر، غني بالدهون والنكهة.",
    price: 120.0,
    category: "Beef",
    unit: "كغم",
    imageUrl: "https://placehold.co/150x150/8b0000/ffffff?text=ستيك",
  },
  {
    id: "lambchops",
    name: "ريش ضأن",
    description: "قطع لحم ضأن طرية ومثالية للشواء.",
    price: 95.0,
    category: "Lamb",
    unit: "كغم",
    imageUrl: "https://placehold.co/150x150/5d0000/ffffff?text=ضأن",
  },
  {
    id: "ground",
    name: "لحم مفروم ممتاز",
    description: "لحم بقري مفروم عالي الجودة لجميع الأطباق.",
    price: 65.0,
    category: "Beef",
    unit: "كغم",
    imageUrl: "https://placehold.co/150x150/b03030/ffffff?text=مفروم",
  },
  {
    id: "chicken",
    name: "صدور دجاج طازجة",
    description: "صدور دجاج مخلية، مثالية للدايت.",
    price: 40.0,
    category: "Poultry",
    unit: "كغم",
    imageUrl: "https://placehold.co/150x150/d2691e/ffffff?text=دجاج",
  },
];

const initialCategoriesData = [
  { id: "Beef", name: "لحم بقري", order: 1 },
  { id: "Lamb", name: "لحم ضأن", order: 2 },
  { id: "Poultry", name: "دواجن", order: 3 },
];

// -------------------------------------------------------------------------
// مكون التأكيد المخصص (Confirmation Modal)
// -------------------------------------------------------------------------
const ConfirmationModal = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div
      className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center border-t-4 border-red-600"
      dir="rtl"
    >
      <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="flex justify-center space-x-4 space-x-reverse">
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-semibold transition flex items-center"
        >
          <CheckCircle className="w-4 h-4 ml-2" /> تأكيد الحذف
        </button>
        <button
          onClick={onClose}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded-lg font-semibold transition flex items-center"
        >
          <X className="w-4 h-4 ml-2" /> إلغاء
        </button>
      </div>
    </div>
  </div>
);

// -------------------------------------------------------------------------
// مكون إدارة الأقسام
// -------------------------------------------------------------------------
const CategoryFormModal = ({ category = null, onClose, db, appId }) => {
  const [formData, setFormData] = useState({
    name: category?.name || "",
    order: category?.order !== undefined ? category.order : 0,
  });
  const isEditing = !!category;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "order" ? parseInt(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db || !formData.name) return;
    const categoriesRef = collection(db, getCategoryCollectionPath(appId));

    try {
      const categoryId = isEditing
        ? category.id
        : formData.name.replace(/\s/g, "");

      const dataToSave = {
        name: formData.name,
        order: formData.order,
        id: categoryId,
      };

      await setDoc(doc(categoriesRef, categoryId), dataToSave);
      onClose();
    } catch (error) {
      console.error(`خطأ في ${isEditing ? "تعديل" : "إضافة"} القسم:`, error);
      console.log("حدث خطأ أثناء حفظ القسم. تحقق من الكونسول.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6"
        dir="rtl"
      >
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <h3 className="text-xl font-bold text-blue-800 flex items-center">
            <Layers className="w-5 h-5 ml-2" />
            {isEditing ? `تعديل القسم: ${category.name}` : "إضافة قسم جديد"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-500"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              اسم القسم
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="مثال: لحم بقري، ضأن، دواجن"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ترتيب العرض (كلما كان الرقم أصغر ظهر أولاً)
            </label>
            <input
              type="number"
              name="order"
              value={formData.order}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center transition"
          >
            <Save className="w-5 h-5 ml-2" />{" "}
            {isEditing ? "حفظ التعديلات" : "إضافة القسم"}
          </button>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// المكون الرئيسي للتطبيق
// -------------------------------------------------------------------------
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  // السلة: يتم تهيئتها ككائن فارغ
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [cartIsLoaded, setCartIsLoaded] = useState(false); // حالة جديدة لتتبع تحميل السلة
  const [currentPage, setCurrentPage] = useState("home");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminsExist, setAdminsExist] = useState(false);
  const [modal, setModal] = useState(null);

  // 1. تهيئة Firebase والمصادقة (تُشغل مرة واحدة)
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authInstance = getAuth(app);

        setDb(firestore);
        setAuth(authInstance);

        onAuthStateChanged(authInstance, async (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            try {
              let userCredential;
              if (initialAuthToken) {
                userCredential = await signInWithCustomToken(
                  authInstance,
                  initialAuthToken
                );
              } else {
                userCredential = await signInAnonymously(authInstance);
              }
              setUserId(userCredential.user.uid);
            } catch (error) {
              console.error("خطأ في المصادقة:", error);
              setUserId("guest-" + crypto.randomUUID());
            }
          }
        });
      } catch (error) {
        console.error("فشل تهيئة Firebase:", error);
        setLoading(false);
      }
    };
    initializeFirebase();
  }, []);

  // 2. جلب المنتجات والأقسام (تُشغل عند جاهزية DB و UserId)
  useEffect(() => {
    if (!db || !userId) return; // *** تم التعديل: لن يتم الجلب إلا بعد تعيين userId ***

    const productsRef = collection(db, getProductCollectionPath(appId));
    const categoriesRef = collection(db, getCategoryCollectionPath(appId));
    const adminsRef = collection(db, getAdminsCollectionPath(appId));

    const seedDataIfNeeded = async () => {
      try {
        const productSnapshot = await getDocs(productsRef);
        if (productSnapshot.empty) {
          for (const product of initialProductsData) {
            await setDoc(doc(productsRef, product.id), product);
          }
        }
        const categorySnapshot = await getDocs(categoriesRef);
        if (categorySnapshot.empty) {
          for (const category of initialCategoriesData) {
            await setDoc(doc(categoriesRef, category.id), category);
          }
        }
      } catch (e) {
        console.error("خطأ أثناء محاولة تغذية البيانات الأولية:", e);
      }
    };

    seedDataIfNeeded();

    const unsubscribeProducts = onSnapshot(
      query(productsRef),
      (snapshot) => {
        const fetchedProducts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setProducts(fetchedProducts);
      },
      (error) => console.error("خطأ في جلب المنتجات:", error)
    );

    const unsubscribeCategories = onSnapshot(
      query(categoriesRef),
      (snapshot) => {
        const fetchedCategories = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setCategories(fetchedCategories);
      },
      (error) => console.error("خطأ في جلب الأقسام:", error)
    );

    const unsubscribeAdminsList = onSnapshot(
      query(adminsRef),
      (snapshot) => {
        setAdminsExist(!snapshot.empty);
      },
      (error) => console.error("خطأ في جلب قائمة المسؤولين:", error)
    );

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
      unsubscribeAdminsList();
    };
  }, [db, userId]); // *** تم التعديل: إضافة userId كاعتمادية للتأكد من جاهزية المصادقة ***

  // 3. التحقق الأمني من دور المسؤول (تُشغل عند جاهزية DB و UserId)
  useEffect(() => {
    if (!db || !userId) return;

    const adminDocRef = doc(db, getAdminsCollectionPath(appId), userId);

    const unsubscribeAdminCheck = onSnapshot(
      adminDocRef,
      (docSnapshot) => {
        setIsAdmin(docSnapshot.exists());
      },
      (error) => console.error("خطأ في التحقق من دور المسؤول:", error)
    );

    return () => unsubscribeAdminCheck();
  }, [db, userId]);

  // 4. جلب وحفظ السلة (Persistent Cart Logic)
  useEffect(() => {
    if (!db || !userId) return;

    const cartDocRef = doc(db, getCartDocPath(userId));
    let isFirstLoad = true;
    let unsubscribeCart = () => {};

    // 4.1. الاستماع إلى تحديثات السلة من Firestore (القراءة)
    unsubscribeCart = onSnapshot(
      cartDocRef,
      (docSnapshot) => {
        const fetchedCartData = docSnapshot.exists()
          ? docSnapshot.data().items || {}
          : {};

        // التأكد من أن البيانات التي تم جلبها هي كائن JSON صالح، إذا لم يكن الأمر كذلك، استخدم كائن فارغ.
        let safeCart = {};
        try {
          // نحن نحفظ السلة كـ JSON string في Firestore، لذلك يجب أن نقوم بتحويلها
          safeCart = JSON.parse(fetchedCartData);
        } catch (e) {
          safeCart = {};
        }

        setCart(safeCart);
        setCartIsLoaded(true); // تم تحميل السلة الآن
        if (isFirstLoad) {
          setLoading(false); // يمكن إنهاء التحميل بعد جلب بيانات المستخدم والسلة
          isFirstLoad = false;
        }
      },
      (error) => {
        console.error("خطأ في جلب السلة:", error);
        setCartIsLoaded(true);
        setLoading(false);
      }
    );

    // 4.2. وظيفة التنظيف لإلغاء الاشتراك
    return () => {
      if (unsubscribeCart) {
        unsubscribeCart();
      }
    };
  }, [db, userId]);

  // 4.3. حفظ السلة إلى Firestore كلما تغيرت (الكتابة)
  useEffect(() => {
    // لا تحفظ إذا:
    // 1. لم يتم تهيئة DB/UserId بعد
    // 2. إذا كانت السلة لم تُقرأ بعد من Firestore (لمنع الكتابة فوق البيانات عند التحميل الأولي)
    // 3. إذا لم يتم تحميل السلة بعد
    if (!db || !userId || !cartIsLoaded) return;

    const saveCartToFirestore = async () => {
      const cartDocRef = doc(db, getCartDocPath(userId));
      try {
        // نحفظ السلة كـ JSON string لضمان توافق تخزين البيانات في Firestore
        await setDoc(cartDocRef, {
          items: JSON.stringify(cart),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("خطأ في حفظ السلة:", error);
      }
    };

    // يتم تأخير الحفظ قليلاً لدمج التحديثات السريعة (Debounce)
    const timeoutId = setTimeout(saveCartToFirestore, 300);

    return () => clearTimeout(timeoutId);
  }, [cart, db, userId, cartIsLoaded]);

  // 5. جلب الطلبات (تُشغل فقط للمسؤول)
  useEffect(() => {
    if (!db || !userId || !isAdmin) {
      setOrders([]);
      return;
    }

    const allOrdersRef = collection(db, getAllOrdersCollectionPath(appId));

    const unsubscribeOrders = onSnapshot(
      query(allOrdersRef),
      (snapshot) => {
        const fetchedOrders = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setOrders(fetchedOrders);
      },
      (error) => console.error("خطأ في جلب الطلبات:", error)
    );

    return () => unsubscribeOrders();
  }, [db, userId, isAdmin]);

  // 6. منطق السلة والوظائف المساعدة

  const addToCart = (product) => {
    setCart((prevCart) => {
      const existingItem = prevCart[product.id];
      // الإضافة الافتراضية تكون 1.0 كغم/وحدة
      const newQuantity = (existingItem ? existingItem.quantity : 0) + 1.0;
      return {
        ...prevCart,
        [product.id]: { product, quantity: newQuantity },
      };
    });
  };

  const updateCartQuantity = (productId, newQuantity) => {
    setCart((prevCart) => {
      const newCart = { ...prevCart };
      // إذا كانت الكمية أقل من أو تساوي 0.009، نحذف المنتج من السلة
      if (newQuantity < 0.01) {
        delete newCart[productId];
      } else {
        // تحديث المنتج بالكامل لضمان تحديث بياناته إذا تغيرت (رغم أنه يجب أن تكون ثابتة)
        newCart[productId] = { ...newCart[productId], quantity: newQuantity };
      }
      return newCart;
    });
  };

  // حساب الإجمالي الفرعي (بدون شحن)
  const cartSubtotal = useMemo(() => {
    return Object.values(cart).reduce((total, item) => {
      return total + item.product.price * item.quantity;
    }, 0);
  }, [cart]);

  const placeOrder = async (customerDetails, shippingCost) => {
    if (!db || Object.keys(cart).length === 0 || shippingCost === undefined)
      return;

    const orderTotal = cartSubtotal + shippingCost;

    const orderData = {
      ...customerDetails,
      userId: userId,
      items: Object.values(cart).map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unit: item.product.unit,
        price: item.product.price,
        total: item.product.price * item.quantity,
      })),
      subtotal: cartSubtotal,
      shippingCost: shippingCost,
      total: orderTotal,
      status: "New",
      createdAt: serverTimestamp(),
    };

    try {
      const allOrdersRef = collection(db, getAllOrdersCollectionPath(appId));
      await addDoc(allOrdersRef, orderData);

      const userOrdersRef = collection(db, getOrderCollectionPath(userId));
      await addDoc(userOrdersRef, orderData);

      // مسح السلة بعد الطلب وحفظ التغيير في Firestore
      setCart({});
      setModal("success");
    } catch (error) {
      console.error("خطأ في حفظ الطلب:", error);
      setModal("error");
    }
  };

  const deleteCategory = useCallback(
    async (categoryId) => {
      if (!db) return;
      try {
        await deleteDoc(doc(db, getCategoryCollectionPath(appId), categoryId));
      } catch (error) {
        console.error("خطأ في حذف القسم:", error);
      }
    },
    [db]
  );

  const deleteProduct = useCallback(
    async (productId) => {
      if (!db) return;
      try {
        await deleteDoc(doc(db, getProductCollectionPath(appId), productId));
      } catch (error) {
        console.error("خطأ في حذف المنتج:", error);
      }
    },
    [db]
  );

  const claimAdminStatus = async () => {
    if (!db || !userId) return;

    try {
      const adminsRef = collection(db, getAdminsCollectionPath(appId));
      await setDoc(doc(adminsRef, userId), {
        userId: userId,
        assignedAt: serverTimestamp(),
      });
      console.log("تم تعيينك كمسؤول بنجاح!");
    } catch (error) {
      console.error("خطأ في تعيين حالة المسؤول:", error);
    }
  };

  // -------------------------------------------------------------------------
  // مكونات الواجهة (Rendering Components)
  // -------------------------------------------------------------------------

  // مكون التنقل (Header)
  const Header = () => (
    <header className="bg-red-900 shadow-lg p-4 sticky top-0 z-10">
      <div
        className="max-w-7xl mx-auto flex justify-between items-center"
        dir="rtl"
      >
        <div className="flex items-center space-x-2 space-x-reverse">
          <Beef className="w-8 h-8 text-white" />
          <h1 className="text-3xl font-extrabold text-white">
            جزارة <span className="text-red-400">جود بيف</span>
          </h1>
        </div>
        <nav className="flex items-center space-x-6 space-x-reverse text-sm font-medium">
          <button
            onClick={() => setCurrentPage("home")}
            className={`text-white hover:text-red-300 transition ${
              currentPage === "home" ? "text-red-300" : ""
            }`}
          >
            <Home className="w-5 h-5 inline ml-1" /> الرئيسية
          </button>
          <button
            onClick={() => setCurrentPage("about")}
            className={`text-white hover:text-red-300 transition ${
              currentPage === "about" ? "text-red-300" : ""
            }`}
          >
            <Info className="w-5 h-5 inline ml-1" /> من نحن
          </button>
          {isAdmin && (
            <button
              onClick={() => setCurrentPage("admin")}
              className={`text-yellow-400 hover:text-yellow-300 transition ${
                currentPage === "admin" ? "font-bold" : ""
              }`}
            >
              <Shield className="w-5 h-5 inline ml-1" /> لوحة التحكم
            </button>
          )}
          {/* زر الواتساب */}
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full bg-green-500 hover:bg-green-600 transition"
            title="تواصل معنا عبر واتساب"
          >
            <MessageSquare className="w-6 h-6 text-white" />
          </a>
          <button
            onClick={() => setModal("cart")}
            className="relative p-2 rounded-full bg-red-700 hover:bg-red-600 transition"
          >
            <ShoppingCart className="w-6 h-6 text-white" />
            {Object.keys(cart).length > 0 && (
              <span className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center -mt-1 -mr-1">
                {Object.values(cart)
                  .reduce((sum, item) => sum + item.quantity, 0)
                  .toFixed(1)}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );

  // مكون إدارة المسؤولين (Admin Panel)
  const AdminPanel = () => {
    const [activeTab, setActiveTab] = useState("products"); // products, orders
    const [orderFilter, setOrderFilter] = useState("All");

    // تصفية الطلبات
    const filteredOrders = useMemo(() => {
      if (orderFilter === "All") return orders;
      return orders.filter((order) => order.status === orderFilter);
    }, [orders, orderFilter]);

    const updateOrderStatus = async (orderId, newStatus) => {
      if (!db) return;
      try {
        const allOrdersRef = doc(
          db,
          getAllOrdersCollectionPath(appId),
          orderId
        );
        await updateDoc(allOrdersRef, { status: newStatus });
      } catch (error) {
        console.error("خطأ في تحديث حالة الطلب:", error);
      }
    };

    return (
      <div
        className="p-8 max-w-7xl mx-auto bg-white shadow-2xl rounded-xl mt-8"
        dir="rtl"
      >
        <h2 className="text-4xl font-extrabold text-red-800 border-b pb-4 mb-6 flex items-center">
          <Shield className="w-8 h-8 ml-3" />
          لوحة تحكم المسؤول
        </h2>

        <div className="flex border-b mb-6">
          <button
            onClick={() => setActiveTab("products")}
            className={`px-4 py-2 text-lg font-semibold border-b-2 transition ${
              activeTab === "products"
                ? "border-red-700 text-red-700"
                : "border-transparent text-gray-500 hover:text-red-500"
            }`}
          >
            إدارة المنتجات والأقسام
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2 text-lg font-semibold border-b-2 transition ${
              activeTab === "orders"
                ? "border-red-700 text-red-700"
                : "border-transparent text-gray-500 hover:text-red-500"
            }`}
          >
            استقبال الطلبات
          </button>
        </div>

        {/* إدارة المنتجات والأقسام */}
        {activeTab === "products" && (
          <>
            {/* إدارة المنتجات */}
            <div className="border-b pb-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-gray-700">
                  إدارة المنتجات
                </h3>
                <button
                  onClick={() => setModal({ type: "addProduct" })}
                  className="bg-red-700 hover:bg-red-800 text-white py-2 px-4 rounded-lg flex items-center transition shadow-md shadow-red-500/50"
                >
                  <PlusCircle className="w-5 h-5 ml-2" /> إضافة منتج جديد
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200"
                  >
                    <h4 className="font-bold text-lg text-gray-900">
                      {product.name}
                    </h4>
                    <p className="text-sm text-gray-600 mb-2">
                      {product.category} | {product.price.toFixed(2)} {CURRENCY}{" "}
                      / {product.unit}
                    </p>
                    <div className="flex space-x-2 space-x-reverse mt-3">
                      <button
                        onClick={() =>
                          setModal({ type: "editProduct", product })
                        }
                        className="text-blue-600 hover:text-blue-800 p-1"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      {/* استخدام Confirmation Modal للحذف */}
                      <button
                        onClick={() =>
                          setModal({
                            type: "confirmDelete",
                            title: "تأكيد حذف المنتج",
                            message: `هل أنت متأكد من حذف المنتج: ${product.name}؟ لا يمكن التراجع عن هذا الإجراء.`,
                            onConfirm: () => deleteProduct(product.id),
                          })
                        }
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* إدارة الأقسام */}
            <div dir="rtl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-gray-700 flex items-center">
                  <Layers className="w-6 h-6 ml-2" /> إدارة الأقسام
                </h3>
                <button
                  onClick={() => setModal({ type: "addCategory" })}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg flex items-center transition shadow-md"
                >
                  <PlusCircle className="w-5 h-5 ml-2" /> إضافة قسم جديد
                </button>
              </div>
              <div className="space-y-3">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center border-l-4 border-blue-500"
                  >
                    <p className="font-semibold">
                      {cat.name}{" "}
                      <span className="text-gray-500 text-sm">
                        (ترتيب: {cat.order})
                      </span>
                    </p>
                    <div className="flex space-x-2 space-x-reverse">
                      <button
                        onClick={() =>
                          setModal({ type: "editCategory", category: cat })
                        }
                        className="text-blue-600 hover:text-blue-800 p-1"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      {/* استخدام Confirmation Modal لحذف القسم */}
                      <button
                        onClick={() =>
                          setModal({
                            type: "confirmDelete",
                            title: "تأكيد حذف القسم",
                            message: `هل أنت متأكد من حذف القسم: ${cat.name}؟ سيتم تعطيل عرض المنتجات المرتبطة به.`,
                            onConfirm: () => deleteCategory(cat.id),
                          })
                        }
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* إدارة الطلبات */}
        {activeTab === "orders" && (
          <>
            <div className="flex space-x-4 space-x-reverse mb-6">
              {["All", "New", "In Progress", "Delivered"].map((status) => (
                <button
                  key={status}
                  onClick={() => setOrderFilter(status)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition flex items-center ${
                    orderFilter === status
                      ? "bg-red-700 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {status === "New" ? (
                    <Clock className="w-4 h-4 ml-1" />
                  ) : status === "In Progress" ? (
                    <Loader2 className="w-4 h-4 ml-1" />
                  ) : status === "Delivered" ? (
                    <CheckCircle className="w-4 h-4 ml-1" />
                  ) : null}
                  {status === "New"
                    ? "جديد"
                    : status === "In Progress"
                    ? "قيد التنفيذ"
                    : status === "Delivered"
                    ? "تم التوصيل"
                    : "الكل"}
                </button>
              ))}
            </div>

            {filteredOrders.length === 0 ? (
              <p className="text-center py-10 text-gray-500">
                لا توجد طلبات{" "}
                {orderFilter !== "All" ? `بحالة '${orderFilter}'` : "حاليًا"}.
              </p>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-gray-50 p-4 rounded-lg shadow-md border border-red-100"
                  >
                    <div className="flex justify-between items-start border-b pb-2 mb-3">
                      <div className="font-bold text-lg">
                        طلب #{order.id.substring(0, 8)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {order.createdAt?.toDate
                          ? new Date(order.createdAt.toDate()).toLocaleString(
                              "ar-SA"
                            )
                          : "جار التحميل"}
                      </div>
                    </div>
                    <p className="text-base font-semibold">
                      العميل: {order.name} (
                      <Phone className="w-4 h-4 inline mr-1" />
                      {order.phone})
                    </p>
                    <p className="text-sm text-gray-600">
                      العنوان: {order.address}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      الشحن: {order.shippingCost.toFixed(2)} {CURRENCY}
                    </p>
                    <p className="text-lg text-red-700 font-extrabold mb-2">
                      الإجمالي الكلي: {order.total.toFixed(2)} {CURRENCY}
                    </p>

                    <ul className="text-xs text-gray-700 list-disc list-inside mr-5 mt-2">
                      {order.items.map((item, index) => (
                        <li key={index}>
                          {item.name}: {item.quantity.toFixed(2)} {item.unit}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 pt-3 border-t flex justify-between items-center">
                      <span
                        className={`px-3 py-1 text-sm font-bold rounded-full ${
                          order.status === "New"
                            ? "bg-red-100 text-red-700"
                            : order.status === "In Progress"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {order.status === "New"
                          ? "جديد"
                          : order.status === "In Progress"
                          ? "قيد التنفيذ"
                          : "تم التوصيل"}
                      </span>
                      <div className="flex space-x-2 space-x-reverse">
                        {order.status !== "Delivered" && (
                          <button
                            onClick={() =>
                              updateOrderStatus(order.id, "Delivered")
                            }
                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 text-sm rounded-lg transition"
                          >
                            تم التوصيل
                          </button>
                        )}
                        {order.status === "New" && (
                          <button
                            onClick={() =>
                              updateOrderStatus(order.id, "In Progress")
                            }
                            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-sm rounded-lg transition"
                          >
                            بدء التنفيذ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // مكون سلة المشتريات (Cart Modal)
  const CartModal = ({ onClose }) => {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6"
          dir="rtl"
        >
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h3 className="text-xl font-bold text-red-800">سلة المشتريات</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-red-500"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {Object.keys(cart).length === 0 ? (
            <p className="text-center py-10 text-gray-500">السلة فارغة.</p>
          ) : (
            <>
              <ul className="space-y-4 max-h-80 overflow-y-auto pr-2">
                {Object.values(cart).map((item) => (
                  <li
                    key={item.product.id}
                    className="flex items-center justify-between border-b pb-2 last:border-b-0"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">
                        {item.product.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.product.price.toFixed(2)} {CURRENCY} /{" "}
                        {item.product.unit}
                      </p>
                    </div>
                    {/* حقل إدخال الكمية (الآن بدقة 0.01 كغم) */}
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <input
                        type="number"
                        step="0.01" // السماح بالكسور العشرية بدقة عالية
                        min="0.01"
                        value={item.quantity.toFixed(2)}
                        onChange={(e) => {
                          let newQuantity = parseFloat(e.target.value);
                          if (isNaN(newQuantity)) return;
                          updateCartQuantity(item.product.id, newQuantity);
                        }}
                        onBlur={(e) => {
                          let finalQuantity = parseFloat(e.target.value);
                          // يتم الحذف إذا كانت الكمية أقل من 0.01 (للتخلص من 0)
                          if (isNaN(finalQuantity) || finalQuantity < 0.01) {
                            updateCartQuantity(item.product.id, 0);
                          }
                        }}
                        className="w-20 p-1 border border-gray-300 rounded-lg text-center focus:ring-red-500 focus:border-red-500"
                      />
                      <span className="text-md text-gray-500">
                        {item.product.unit}
                      </span>
                      <span className="font-bold text-red-700 text-lg mr-4 w-16 text-right">
                        {(item.product.price * item.quantity).toFixed(2)}{" "}
                        {CURRENCY}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(item.product.id, 0)} // إزالة بالكامل
                        className="text-red-500 hover:text-red-700 p-1 rounded-full bg-red-50/50 hover:bg-red-100 transition"
                        aria-label={`إزالة ${item.product.name}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-6 pt-4 border-t border-red-200">
                <div className="flex justify-between items-center text-xl font-bold text-gray-900 mb-4">
                  <span>الإجمالي الفرعي:</span>
                  <span className="text-red-800">
                    {cartSubtotal.toFixed(2)} {CURRENCY}
                  </span>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    setModal("checkoutForm");
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition duration-200 shadow-lg shadow-green-500/40 flex items-center justify-center"
                >
                  <Truck className="w-5 h-5 ml-2" />
                  المتابعة لإتمام الشراء
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // نموذج تفاصيل الدفع (Checkout Form)
  const CheckoutFormModal = ({ onClose }) => {
    const [details, setDetails] = useState({
      name: "",
      phone: "",
      address: "",
      zoneId: SHIPPING_ZONES[0].id, // تعيين المنطقة الافتراضية "اختر"
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // استخراج تفاصيل منطقة الشحن المختارة
    const selectedZone =
      SHIPPING_ZONES.find((zone) => zone.id === details.zoneId) ||
      SHIPPING_ZONES[0];
    const shippingCost = selectedZone.cost;
    const orderTotal = cartSubtotal + shippingCost;

    const handleChange = (e) => {
      const { name, value } = e.target;
      setDetails((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (details.zoneId === "select") {
        // استخدام modal أو رسالة تنبيه مخصصة بدلاً من alert
        console.log("الرجاء اختيار منطقة التوصيل أولاً.");
        return;
      }
      setIsSubmitting(true);
      await placeOrder(details, shippingCost);
      setIsSubmitting(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6"
          dir="rtl"
        >
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h3 className="text-xl font-bold text-red-800">بيانات التوصيل</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-red-500"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* تفاصيل الفاتورة قبل الطلب */}
          <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between text-md text-gray-700">
              <span>الإجمالي الفرعي:</span>
              <span>
                {cartSubtotal.toFixed(2)} {CURRENCY}
              </span>
            </div>
            <div className="flex justify-between text-md text-red-700 font-semibold">
              <span>تكلفة الشحن ({selectedZone.name}):</span>
              <span>
                {shippingCost.toFixed(2)} {CURRENCY}
              </span>
            </div>
            <div className="flex justify-between text-xl font-bold text-red-800 border-t pt-2">
              <span>الإجمالي الكلي:</span>
              <span>
                {orderTotal.toFixed(2)} {CURRENCY}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* اختيار المنطقة */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                منطقة التوصيل
              </label>
              <select
                name="zoneId"
                value={details.zoneId}
                onChange={handleChange}
                required
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500"
              >
                {SHIPPING_ZONES.map((zone) => (
                  <option
                    key={zone.id}
                    value={zone.id}
                    disabled={zone.id === "select"}
                  >
                    {zone.name} ({zone.cost.toFixed(2)} {CURRENCY})
                  </option>
                ))}
              </select>
            </div>
            {["name", "phone", "address"].map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field === "name"
                    ? "الاسم الكامل"
                    : field === "phone"
                    ? "رقم الهاتف (للتواصل)"
                    : "العنوان التفصيلي"}
                </label>
                <input
                  type={field === "phone" ? "tel" : "text"}
                  name={field}
                  value={details[field]}
                  onChange={handleChange}
                  required
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500"
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={
                isSubmitting ||
                cartSubtotal === 0 ||
                details.zoneId === "select"
              }
              className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3 rounded-lg flex items-center justify-center transition disabled:bg-gray-400"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 ml-2 animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5 ml-2" />
              )}
              تأكيد الطلب ({orderTotal.toFixed(2)} {CURRENCY})
            </button>
          </form>
        </div>
      </div>
    );
  };

  // مكون بطاقة المنتج (ProductCard)
  const ProductCard = ({ product }) => (
    <div className="bg-white rounded-xl shadow-2xl overflow-hidden hover:shadow-red-500/50 transition duration-300 transform hover:-translate-y-1 border border-gray-100">
      <div
        className="h-40 bg-cover bg-center"
        style={{ backgroundImage: `url(${product.imageUrl})` }}
        onError={(e) => (e.target.style.backgroundImage = "none")}
      >
        <div className="flex items-center justify-center h-full bg-black/10">
          <Beef className="w-12 h-12 text-white/80" />
        </div>
      </div>
      <div className="p-5 text-right">
        <h3 className="text-xl font-bold text-gray-900 mb-1">{product.name}</h3>
        <p className="text-sm text-gray-500 mb-3">{product.description}</p>
        <div className="flex justify-between items-center mb-4">
          <span className="text-2xl font-extrabold text-red-700">
            {product.price?.toFixed(2) || "0.00"} {CURRENCY}
          </span>
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            / {product.unit}
          </span>
        </div>
        <button
          onClick={() => addToCart(product)}
          className="w-full bg-red-700 hover:bg-red-800 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center transition duration-200 shadow-md shadow-red-500/50"
        >
          <ShoppingCart className="w-5 h-5 ml-2" />
          أضف 1.0 {product.unit}
        </button>
      </div>
    </div>
  );

  // مكون ملخص السلة (CartSummary)
  const CartSummary = () => (
    <div className="bg-white sticky top-24 p-6 rounded-xl shadow-2xl border border-red-100">
      <h2 className="text-2xl font-bold text-red-700 mb-6 flex items-center justify-between">
        ملخص السلة <ShoppingCart className="w-6 h-6" />
      </h2>
      {Object.keys(cart).length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <p>سلتك فارغة حالياً.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {Object.values(cart).map((item) => (
              <li
                key={item.product.id}
                className="flex items-center justify-between border-b pb-2 last:border-b-0"
              >
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">
                    {item.product.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {item.quantity.toFixed(2)} {item.product.unit} ×{" "}
                    {item.product.price.toFixed(2)} {CURRENCY}
                  </p>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <span className="font-bold text-red-700">
                    {(item.product.price * item.quantity).toFixed(2)}
                  </span>
                  <button
                    onClick={() => updateCartQuantity(item.product.id, 0)}
                    className="text-red-500 hover:text-red-700 p-1 rounded-full bg-red-50/50 hover:bg-red-100 transition"
                    aria-label={`إزالة ${item.product.name}`}
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 pt-4 border-t border-red-200">
            <div className="flex justify-between items-center text-xl font-bold text-gray-900">
              <span>الإجمالي الفرعي:</span>
              <span className="text-red-800">
                {cartSubtotal.toFixed(2)} {CURRENCY}
              </span>
            </div>
            <p className="text-sm text-gray-500 text-center mt-2">
              تكلفة الشحن تُحدد في صفحة الدفع.
            </p>
            <button
              onClick={() => setModal("checkoutForm")}
              className="mt-5 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition duration-200 shadow-lg shadow-green-500/40 flex items-center justify-center"
            >
              <Truck className="w-5 h-5 ml-2" />
              إتمام الشراء
            </button>
          </div>
        </>
      )}
    </div>
  );

  // صفحة من نحن (AboutUsPage)
  const AboutUsPage = () => (
    <div
      className="p-8 max-w-4xl mx-auto bg-white shadow-2xl rounded-xl mt-8"
      dir="rtl"
    >
      <h2 className="text-4xl font-extrabold text-red-800 border-b pb-4 mb-6 flex items-center">
        <Info className="w-8 h-8 ml-3" />
        من نحن في جزارة جود بيف
      </h2>
      <p className="text-lg text-gray-700 mb-6 leading-relaxed">
        تأسست جزارة **جود بيف** على مبدأ بسيط: تقديم اللحوم بأعلى مستويات الجودة
        والنضارة مباشرة إلى عتبة منزلك. نحن نؤمن بأن كل وجبة تستحق أفضل
        المكونات، ولهذا نعمل مباشرة مع المزارع الموثوقة لضمان تربية الماشية
        وفقاً لأفضل المعايير.
      </p>
      <h3 className="text-2xl font-bold text-gray-800 mt-8 mb-4">
        التزامنا بالجودة
      </h3>
      <ul className="list-disc list-inside space-y-3 text-gray-600 mr-5">
        <li>
          <span className="font-semibold text-red-700">الذبح الحلال:</span> جميع
          منتجاتنا تتبع أساليب الذبح الإسلامي.
        </li>
        <li>
          <span className="font-semibold text-red-700">الطزاجة مضمونة:</span>{" "}
          يتم تجهيز اللحوم وتغليفها في نفس يوم الطلب.
        </li>
        <li>
          <span className="font-semibold text-red-700">الشفافية:</span> يمكنك
          دائماً معرفة مصدر اللحم الذي تتناوله.
        </li>
      </ul>
      <p className="text-base text-gray-500 mt-6 pt-4 border-t">
        انضم إلى عائلة جود بيف واستمتع بتجربة طعم اللحم الحقيقي.
      </p>
    </div>
  );

  // مكون تذييل الصفحة (Footer)
  const Footer = () => (
    <footer className="bg-red-900 text-white mt-12 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-xl font-bold mb-4 text-red-300">جزارة جود بيف</h3>
          <p className="text-sm text-gray-400">
            نحن نقدم أجود أنواع اللحوم الطازجة مباشرة من المزرعة إلى مائدتك.
            الجودة هي التزامنا الأول.
          </p>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-4 text-red-300">
            معلومات التواصل
          </h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>
              <Phone className="w-4 h-4 inline ml-1" />{" "}
              <span className="font-semibold">الهاتف:</span> {WHATSAPP_NUMBER}
            </li>
            <li>
              <MessageSquare className="w-4 h-4 inline ml-1" />{" "}
              <span className="font-semibold">واتساب:</span>{" "}
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-red-300 transition"
              >
                انقر للتواصل
              </a>
            </li>
            <li>
              <span className="font-semibold">البريد الإلكتروني:</span>{" "}
              info@goodbeef.com
            </li>
            <li>
              <span className="font-semibold">العنوان:</span> الإسكندرية، منطقة
              كرموز
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-4 text-red-300">روابط سريعة</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <button
                onClick={() => setCurrentPage("home")}
                className="hover:text-red-300 transition"
              >
                الرئيسية
              </button>
            </li>
            <li>
              <button
                onClick={() => setCurrentPage("about")}
                className="hover:text-red-300 transition"
              >
                من نحن
              </button>
            </li>
            {isAdmin && (
              <li>
                <button
                  onClick={() => setCurrentPage("admin")}
                  className="hover:text-red-300 transition"
                >
                  لوحة التحكم
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="text-center mt-8 pt-4 border-t border-red-800 text-sm text-gray-500">
        &copy; {new Date().getFullYear()} جزارة جود بيف. جميع الحقوق محفوظة.
      </div>
    </footer>
  );

  // نموذج إضافة/تعديل منتج (ProductFormModal)
  const ProductFormModal = ({ product = null, onClose }) => {
    const [formData, setFormData] = useState({
      name: product?.name || "",
      description: product?.description || "",
      price: product?.price || 0,
      category: product?.category || categories[0]?.id || "",
      unit: product?.unit || "كغم",
      imageUrl:
        product?.imageUrl ||
        "https://placehold.co/150x150/8b0000/ffffff?text=جديد",
    });
    const isEditing = !!product;

    const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!db) return;
      const productsRef = collection(db, getProductCollectionPath(appId));

      try {
        const dataToSave = { ...formData, price: parseFloat(formData.price) };
        if (isEditing) {
          await updateDoc(doc(productsRef, product.id), dataToSave);
        } else {
          await addDoc(productsRef, dataToSave);
        }
        onClose();
      } catch (error) {
        console.error(`خطأ في ${isEditing ? "تعديل" : "إضافة"} المنتج:`, error);
        console.log("حدث خطأ أثناء حفظ المنتج.");
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6"
          dir="rtl"
        >
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <h3 className="text-xl font-bold text-red-800">
              {isEditing ? "تعديل المنتج" : "إضافة منتج جديد"}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-red-500"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {["name", "description", "price", "unit", "imageUrl"].map(
              (field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field === "name"
                      ? "الاسم"
                      : field === "description"
                      ? "الوصف"
                      : field === "price"
                      ? `السعر (${CURRENCY})`
                      : field === "unit"
                      ? "وحدة القياس"
                      : "رابط الصورة"}
                  </label>
                  <input
                    type={field === "price" ? "number" : "text"}
                    step={field === "price" ? "0.01" : null}
                    name={field}
                    value={formData[field]}
                    onChange={handleChange}
                    required
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                القسم
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center transition"
            >
              <Save className="w-5 h-5 ml-2" />{" "}
              {isEditing ? "حفظ التعديلات" : "إضافة المنتج"}
            </button>
          </form>
        </div>
      </div>
    );
  };

  // رسالة نجاح/خطأ (StatusModal)
  const StatusModal = ({ type, onClose }) => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center ${
          type === "success" ? "border-green-500" : "border-red-500"
        }`}
        dir="rtl"
      >
        {type === "success" ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              تم الطلب بنجاح!
            </h3>
            <p className="text-gray-600 mb-4">
              شكرًا لك. سيتم مراجعة طلبك والتواصل معك قريباً لتأكيد التفاصيل.
            </p>
            <button
              onClick={onClose}
              className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg"
            >
              العودة للرئيسية
            </button>
          </>
        ) : (
          <>
            <X className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-800 mb-2">حدث خطأ</h3>
            <p className="text-gray-600 mb-4">
              نأسف، لم نتمكن من تسجيل الطلب. يرجى المحاولة لاحقاً.
            </p>
            <button
              onClick={onClose}
              className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg"
            >
              إغلاق
            </button>
          </>
        )}
      </div>
    </div>
  );

  const renderPageContent = () => {
    if (loading) {
      return (
        <div className="text-center py-20 flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-red-700 animate-spin" />
          <p className="mt-4 text-xl text-gray-600">جارِ تحميل البيانات...</p>
        </div>
      );
    }

    switch (currentPage) {
      case "about":
        return <AboutUsPage />;
      case "admin":
        return isAdmin ? (
          <AdminPanel />
        ) : (
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold text-red-700">الوصول مرفوض</h2>
            <p className="text-gray-600 mt-2">
              عليك أن تكون مسؤولاً مُسجلاً للمتابعة.
            </p>
            {!adminsExist && (
              <button
                onClick={claimAdminStatus}
                className="mt-4 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center mx-auto transition shadow-md"
              >
                <Key className="w-5 h-5 ml-2" /> تعيين كمشرف أول
              </button>
            )}
          </div>
        );
      case "home":
      default:
        return (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3">
              <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <Home className="w-6 h-6 ml-2 text-red-700" />
                اكتشف لحوم <span className="text-red-700 mr-1">
                  جود بيف
                </span>{" "}
                الطازجة
              </h2>

              {categories.map((category) => {
                const productsInCategory = products.filter(
                  (p) => p.category === category.id
                );
                if (productsInCategory.length === 0) return null;

                return (
                  <div key={category.id} className="mb-10">
                    <h3 className="text-2xl font-bold text-gray-700 mb-4 border-b pb-2">
                      {category.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {productsInCategory.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {categories.length === 0 && (
                <p className="text-center py-10 text-gray-500">
                  لا توجد أقسام معروضة حالياً.
                </p>
              )}
            </div>
            <div className="lg:col-span-1">
              <CartSummary />
            </div>
          </div>
        );
    }
  };

  // -------------------------------------------------------------------------
  // عرض النوافذ المنبثقة (Modals)
  // -------------------------------------------------------------------------

  const renderModal = () => {
    if (modal === "cart") return <CartModal onClose={() => setModal(null)} />;
    if (modal === "checkoutForm")
      return <CheckoutFormModal onClose={() => setModal(null)} />;
    if (modal === "success" || modal === "error")
      return (
        <StatusModal
          type={modal}
          onClose={() => {
            setModal(null);
            setCurrentPage("home");
          }}
        />
      );

    // مودال إدارة المنتجات
    if (modal?.type === "addProduct")
      return <ProductFormModal onClose={() => setModal(null)} />;
    if (modal?.type === "editProduct")
      return (
        <ProductFormModal
          product={modal.product}
          onClose={() => setModal(null)}
        />
      );

    // مودال إدارة الأقسام
    if (modal?.type === "addCategory")
      return (
        <CategoryFormModal
          onClose={() => setModal(null)}
          db={db}
          appId={appId}
        />
      );
    if (modal?.type === "editCategory")
      return (
        <CategoryFormModal
          category={modal.category}
          onClose={() => setModal(null)}
          db={db}
          appId={appId}
        />
      );

    // مودال التأكيد المخصص (للحذف)
    if (modal?.type === "confirmDelete")
      return (
        <ConfirmationModal
          title={modal.title}
          message={modal.message}
          onConfirm={modal.onConfirm}
          onClose={() => setModal(null)}
        />
      );

    return null;
  };

  return (
    <div
      className="min-h-screen bg-gray-50 font-[Inter] antialiased text-right"
      dir="rtl"
    >
      {renderModal()}
      <Header />

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
          <span>
            <User className="w-4 h-4 inline ml-1 text-red-500" />
            معرف المستخدم:{" "}
            <span
              className="text-red-400 font-mono text-xs overflow-hidden whitespace-nowrap overflow-ellipsis max-w-[150px] mr-2"
              title={userId}
            >
              {userId}
            </span>
          </span>
          {/* عرض حالة المسؤول بدلاً من زر التبديل غير الآمن */}
          {isAdmin ? (
            <span className="font-semibold py-1 px-3 rounded-full bg-yellow-500 text-white flex items-center">
              <Settings className="w-4 h-4 ml-1" /> وضع المسؤول (مفعل)
            </span>
          ) : (
            !adminsExist && ( // يظهر زر التعيين فقط إذا لم يوجد مسؤول
              <button
                onClick={claimAdminStatus}
                className="font-semibold py-1 px-3 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition flex items-center"
              >
                <Key className="w-4 h-4 ml-1" /> تعيين كمشرف أول
              </button>
            )
          )}
        </div>
        {renderPageContent()}
      </main>

      <Footer />
    </div>
  );
};

export default App;
