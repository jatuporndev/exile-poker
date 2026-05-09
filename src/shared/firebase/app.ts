import { getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBXK82qcyx9TrgSwgTGayEPtfdANljpiVo",
  authDomain: "exilepoker.firebaseapp.com",
  databaseURL: "https://exilepoker-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "exilepoker",
  storageBucket: "exilepoker.firebasestorage.app",
  messagingSenderId: "166953126261",
  appId: "1:166953126261:web:1c450a770fda8456432b3c",
  measurementId: "G-HFHY0VTZN3",
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseDatabase = getDatabase(firebaseApp);
