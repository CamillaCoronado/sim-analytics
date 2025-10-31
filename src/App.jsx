import React, { useState, useEffect, createContext, useContext } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc 
} from 'firebase/firestore';
import { auth, db } from './firebase';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

// auth context
const AuthContext = createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signup = async (email, password, username) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      username,
      email,
      createdAt: new Date().toISOString()
    });
    return userCredential;
  };

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

// main component
function ReceiptAnalytics() {
  const { user, loading: authLoading, signup, login, logout } = useAuth();
  
  const [receipts, setReceipts] = useState([]);
  const [timeFilter, setTimeFilter] = useState('all');
  const [bounties, setBounties] = useState({});
  const [untaggedBounties, setUntaggedBounties] = useState([]);
  const [showBountyModal, setShowBountyModal] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState(null);
  const [selectedConcept, setSelectedConcept] = useState('');
  const [activeTab, setActiveTab] = useState('concepts');
  const [username, setUsername] = useState('');
  
  // auth ui state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authError, setAuthError] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);

  // load data from localStorage or firestore
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // logged in - load from firestore
      loadFromFirestore();
      loadUsername();
    } else {
      // not logged in - clear localStorage on refresh and start fresh
      localStorage.removeItem('receipt_data');
      localStorage.removeItem('bounty_data');
      localStorage.removeItem('untagged_bounties');
      setReceipts([]);
      setBounties({});
      setUntaggedBounties([]);
      setUsername('');
    }
  }, [user, authLoading]);

  // check if we should show save prompt
  useEffect(() => {
    if (!user && receipts.length > 0) {
      setShowSavePrompt(true);
    } else {
      setShowSavePrompt(false);
    }
  }, [user, receipts.length]);

  const loadFromLocalStorage = () => {
    // this function is now unused - keeping for reference but localStorage
    // is cleared on refresh for non-authenticated users
    const stored = localStorage.getItem('receipt_data');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setReceipts(parsed);
      } catch (e) {
        console.error('failed to parse stored receipts:', e);
      }
    }
    
    const storedBounties = localStorage.getItem('bounty_data');
    if (storedBounties) {
      try {
        setBounties(JSON.parse(storedBounties));
      } catch (e) {
        console.error('failed to parse bounties:', e);
      }
    }

    const storedUntagged = localStorage.getItem('untagged_bounties');
    if (storedUntagged) {
      try {
        setUntaggedBounties(JSON.parse(storedUntagged));
      } catch (e) {
        console.error('failed to parse untagged bounties:', e);
      }
    }
  };

  const loadUsername = async () => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
        setUsername(userDocSnap.data().username || '');
      }
    } catch (e) {
      console.error('failed to load username:', e);
    }
  };

  const loadFromFirestore = async () => {
    if (!user) return;
    
    try {
      const docRef = doc(db, 'userData', user.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setReceipts(data.receipts || []);
        setBounties(data.bounties || {});
        setUntaggedBounties(data.untaggedBounties || []);
      } else {
        // first time login - migrate localStorage data if exists
        const localReceipts = localStorage.getItem('receipt_data');
        const localBounties = localStorage.getItem('bounty_data');
        const localUntagged = localStorage.getItem('untagged_bounties');
        
        if (localReceipts || localBounties || localUntagged) {
          const receiptsData = localReceipts ? JSON.parse(localReceipts) : [];
          const bountiesData = localBounties ? JSON.parse(localBounties) : {};
          const untaggedData = localUntagged ? JSON.parse(localUntagged) : [];
          
          await setDoc(docRef, {
            receipts: receiptsData,
            bounties: bountiesData,
            untaggedBounties: untaggedData,
            lastUpdated: new Date().toISOString()
          });
          
          setReceipts(receiptsData);
          setBounties(bountiesData);
          setUntaggedBounties(untaggedData);
          
          // clear localStorage after migration
          localStorage.removeItem('receipt_data');
          localStorage.removeItem('bounty_data');
          localStorage.removeItem('untagged_bounties');
        }
      }
    } catch (e) {
      console.error('failed to load from firestore:', e);
    }
  };

  const saveToStorage = async (newReceipts, newBounties, newUntagged) => {
    if (user) {
      // logged in - save to firestore only, never localStorage
      try {
        const docRef = doc(db, 'userData', user.uid);
        await updateDoc(docRef, {
          receipts: newReceipts,
          bounties: newBounties,
          untaggedBounties: newUntagged,
          lastUpdated: new Date().toISOString()
        });
      } catch (e) {
        // if doc doesn't exist, create it
        try {
          await setDoc(doc(db, 'userData', user.uid), {
            receipts: newReceipts,
            bounties: newBounties,
            untaggedBounties: newUntagged,
            lastUpdated: new Date().toISOString()
          });
        } catch (e2) {
          console.error('failed to save to firestore:', e2);
        }
      }
    } else {
      // not logged in - save to localStorage temporarily (will be cleared on refresh)
      localStorage.setItem('receipt_data', JSON.stringify(newReceipts));
      localStorage.setItem('bounty_data', JSON.stringify(newBounties));
      localStorage.setItem('untagged_bounties', JSON.stringify(newUntagged));
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    
    try {
      if (authMode === 'signup') {
        if (!authUsername.trim()) {
          setAuthError('simcluster username required');
          return;
        }
        await signup(authEmail, authPassword, authUsername);
      } else {
        await login(authEmail, authPassword);
      }
      setShowAuthModal(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthUsername('');
    } catch (e) {
      setAuthError(e.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setReceipts([]);
      setBounties({});
      setUntaggedBounties([]);
    } catch (e) {
      console.error('logout failed:', e);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      
      let newReceipts = [...receipts];
      let newUntagged = [...untaggedBounties];
      let addedCount = 0;
      let addedBounties = 0;
      
      if (parsed.receipts && Array.isArray(parsed.receipts)) {
        // dedupe by date field (timestamp)
        const existingDates = new Set(receipts.map(r => r.date));
        
        parsed.receipts.forEach(receipt => {
          if (!existingDates.has(receipt.date)) {
            newReceipts.push(receipt);
            existingDates.add(receipt.date);
            addedCount++;
          }
        });
        
        if (parsed.bounties && parsed.bounties.length > 0) {
          // dedupe bounties by date too
          const existingBountyDates = new Set(untaggedBounties.map(b => b.date));
          
          parsed.bounties.forEach(bounty => {
            if (!existingBountyDates.has(bounty.date)) {
              newUntagged.push(bounty);
              existingBountyDates.add(bounty.date);
              addedBounties++;
            }
          });
        }
        
        setReceipts(newReceipts);
        setUntaggedBounties(newUntagged);
        
        if (addedCount === 0 && addedBounties === 0) {
          alert('no new data found - all receipts already loaded');
        } else {
          alert(`added ${addedCount} new receipts. ${addedBounties > 0 ? `${addedBounties} new bounties need tagging.` : ''}`);
        }
      } else if (Array.isArray(parsed)) {
        // legacy format - array of receipts
        const existingDates = new Set(receipts.map(r => r.date));
        
        parsed.forEach(receipt => {
          if (!existingDates.has(receipt.date)) {
            newReceipts.push(receipt);
            existingDates.add(receipt.date);
            addedCount++;
          }
        });
        
        setReceipts(newReceipts);
        
        if (addedCount === 0) {
          alert('no new data found - all receipts already loaded');
        } else {
          alert(`added ${addedCount} new receipts`);
        }
      }
      
      await saveToStorage(newReceipts, bounties, newUntagged);
    } catch (e) {
      console.error(e);
      alert('failed to paste - make sure you copied valid receipt data');
    }
  };

  const handleClear = async () => {
    setReceipts([]);
    setBounties({});
    setUntaggedBounties([]);
    await saveToStorage([], {}, []);
  };

  const handleAddBounty = async () => {
    if (!selectedConcept || !selectedBounty) return;
    
    let conceptBounties = bounties[selectedConcept] || [];
    if (!Array.isArray(conceptBounties)) {
      conceptBounties = [];
    }
    
    conceptBounties.push({
      amount: selectedBounty.clout,
      date: selectedBounty.date
    });
    
    const newBounties = { 
      ...bounties, 
      [selectedConcept]: conceptBounties
    };
    setBounties(newBounties);
    
    const remaining = untaggedBounties.filter((_, i) => i !== selectedBounty.index);
    setUntaggedBounties(remaining);
    
    await saveToStorage(receipts, newBounties, remaining);
    
    setShowBountyModal(false);
    setSelectedConcept('');
    setSelectedBounty(null);
  };

  const parseReceiptDate = (dateStr) => {
    try {
      const match = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)\s+(\d+):(\d+)\s+(AM|PM)/);
      if (!match) return null;
      
      const monthMap = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      const month = monthMap[match[1]];
      const day = parseInt(match[2]);
      let hour = parseInt(match[3]);
      const minute = parseInt(match[4]);
      const isPM = match[5] === 'PM';
      
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      
      const now = new Date();
      const date = new Date(now.getFullYear(), month, day, hour, minute);
      
      if (date > now) {
        date.setFullYear(now.getFullYear() - 1);
      }
      
      return date;
    } catch {
      return null;
    }
  };

  const filteredReceipts = timeFilter === '24h' 
    ? receipts.filter(r => {
        const receiptDate = parseReceiptDate(r.date);
        if (!receiptDate) return true;
        const now = new Date();
        const hoursDiff = (now - receiptDate) / (1000 * 60 * 60);
        return hoursDiff <= 24 && hoursDiff >= 0;
      })
    : receipts;

  const getDateRange = () => {
    if (filteredReceipts.length === 0) return '';
    const dates = filteredReceipts.map(r => parseReceiptDate(r.date)).filter(d => d);
    
    if (dates.length === 0) return '';
    const oldest = new Date(Math.min(...dates));
    const newest = new Date(Math.max(...dates));
    return `${oldest.toLocaleDateString()} - ${newest.toLocaleDateString()}`;
  };

  const totalClout = filteredReceipts.reduce((sum, r) => sum + (r.clout || 0), 0);
  const avgClout = filteredReceipts.length ? (totalClout / filteredReceipts.length).toFixed(1) : 0;
  
  const conceptStats = filteredReceipts.reduce((acc, r) => {
    if (r.concept) {
      acc[r.concept] = (acc[r.concept] || 0) + (r.clout || 0);
    }
    return acc;
  }, {});
  
  const conceptData = Object.entries(conceptStats)
    .map(([name, clout]) => {
      const conceptBounties = Array.isArray(bounties[name]) ? bounties[name] : [];
      
      const bountyWindows = conceptBounties.map(bounty => {
        const bountyDate = parseReceiptDate(bounty.date);
        if (!bountyDate) return { amount: bounty.amount, earned: 0, roi: -100 };
        
        const windowEnd = new Date(bountyDate.getTime() + 24 * 60 * 60 * 1000);
        
        const windowEarnings = filteredReceipts
          .filter(r => {
            if (r.concept !== name) return false;
            const receiptDate = parseReceiptDate(r.date);
            if (!receiptDate) return false;
            return receiptDate >= bountyDate && receiptDate <= windowEnd;
          })
          .reduce((sum, r) => sum + (r.clout || 0), 0);
        
        const roi = bounty.amount > 0 ? (((windowEarnings - bounty.amount) / bounty.amount) * 100).toFixed(0) : 0;
        
        return {
          amount: bounty.amount,
          date: bounty.date,
          earned: windowEarnings,
          roi: parseInt(roi)
        };
      });
      
      const totalBountyCost = conceptBounties.reduce((sum, b) => sum + b.amount, 0);
      const totalBountyEarnings = bountyWindows.reduce((sum, w) => sum + w.earned, 0);
      const netIncome = clout - totalBountyCost;
      const avgRoi = bountyWindows.length > 0 
        ? Math.round(bountyWindows.reduce((sum, w) => sum + w.roi, 0) / bountyWindows.length)
        : 0;
      
      const uses = filteredReceipts.filter(r => r.concept === name).length;
      const paidUses = filteredReceipts.filter(r => r.concept === name && (r.clout || 0) > 0).length;
      const freeUses = uses - paidUses;
      const avgPerUse = uses > 0 ? (clout / uses).toFixed(1) : 0;
      
      return { 
        name, 
        clout, 
        bountyCost: totalBountyCost,
        bountyEarnings: totalBountyEarnings,
        bountyWindows,
        netIncome,
        avgRoi,
        uses,
        paidUses,
        freeUses,
        avgPerUse,
        profitable: netIncome > 0
      };
    })
    .sort((a, b) => b.netIncome - a.netIncome);
  
  const userStats = filteredReceipts.reduce((acc, r) => {
    if (r.user !== 'you') {
      acc[r.user] = (acc[r.user] || 0) + 1;
    }
    return acc;
  }, {});
  
  const topUsers = Object.entries(userStats)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const userValueStats = filteredReceipts.reduce((acc, r) => {
    if (r.user !== 'you') {
      acc[r.user] = (acc[r.user] || 0) + (r.clout || 0);
    }
    return acc;
  }, {});

  const topValueUsers = Object.entries(userValueStats)
    .map(([name, clout]) => ({ name, clout }))
    .sort((a, b) => b.clout - a.clout)
    .slice(0, 10);
  
  const actionStats = filteredReceipts.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});
  
  const actionData = Object.entries(actionStats)
    .map(([name, value]) => ({ name, value }));

  const timeOfDayStats = filteredReceipts
    .filter(r => ['like', 'tip'].includes(r.action))
    .reduce((acc, r) => {
      try {
        const timeMatch = r.date.match(/(\d+):(\d+)\s+(AM|PM)/);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1]);
          const isPM = timeMatch[3] === 'PM';
          if (isPM && hour !== 12) hour += 12;
          if (!isPM && hour === 12) hour = 0;
          acc[hour] = (acc[hour] || 0) + (r.clout || 0);
        }
      } catch {}
      return acc;
    }, {});

  const timeOfDayData = Object.entries(timeOfDayStats)
    .map(([hour, clout]) => ({
      hour: `${hour}:00`,
      clout
    }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  
  const cloutFlow = filteredReceipts
    .slice()
    .reverse()
    .reduce((acc, r, i) => {
      const prev = acc[i - 1]?.total || 0;
      acc.push({ 
        index: i, 
        clout: r.clout || 0,
        total: prev + (r.clout || 0),
        label: `${i}`
      });
      return acc;
    }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex items-center justify-center">
        <div className="text-green-400 text-xl">loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-4xl font-bold text-green-400 mb-1">receipt analytics</h1>
              {user && username && (
                <p className="text-2xl text-gray-300">
                  welcome <span className="text-green-300 font-semibold">{username}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  logout
                </button>
              ) : (
                <button
                  onClick={() => {
                    setAuthMode('login');
                    setShowAuthModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  login
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <p className="text-gray-400">
              {receipts.length > 0 
                ? `showing ${filteredReceipts.length} of ${receipts.length} receipts`
                : 'no data yet - run the bookmarklet on your receipts page'}
            </p>
            {receipts.length > 0 && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTimeFilter('all')}
                    className={`px-4 py-1 rounded ${timeFilter === 'all' ? 'bg-green-600' : 'bg-gray-700'} text-white text-sm transition-colors`}
                  >
                    all time
                  </button>
                  <button
                    onClick={() => setTimeFilter('24h')}
                    className={`px-4 py-1 rounded ${timeFilter === '24h' ? 'bg-green-600' : 'bg-gray-700'} text-white text-sm transition-colors`}
                  >
                    last 24h
                  </button>
                </div>
                <p className="text-gray-500 text-sm ml-auto">
                  {getDateRange()}
                </p>
              </>
            )}
          </div>
        </div>

        {showSavePrompt && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4 mb-6 flex justify-between items-center">
            <div>
              <p className="text-yellow-300 font-bold">save your data</p>
              <p className="text-yellow-200 text-sm">sign up to sync your receipts across devices</p>
            </div>
            <button
              onClick={() => {
                setAuthMode('signup');
                setShowAuthModal(true);
              }}
              className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
            >
              sign up
            </button>
          </div>
        )}

        {receipts.length === 0 && (
          <div className="bg-gray-800 rounded-lg p-12 border border-gray-700">
            <div className="text-center mb-8">
              <p className="text-gray-400 text-lg mb-4">waiting for data...</p>
              <button
                onClick={handlePaste}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-lg font-medium mb-6"
              >
                paste receipt data
              </button>
            </div>
            
            <details className="max-w-2xl mx-auto">
              <summary className="text-gray-400 cursor-pointer hover:text-gray-300 text-center mb-6 transition-colors">
                show setup instructions
              </summary>
              
              <div className="space-y-6 text-left mt-6">
                <div className="bg-gray-900 rounded p-4 border border-gray-700">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="text-gray-300 mb-2">create a bookmark with this code as the url:</p>
                      <div className="bg-black rounded p-3 overflow-x-auto">
                        <code className="text-green-400 text-xs break-all">
                          javascript:(function()&#123;const receipts=[];let bounties=[];document.querySelectorAll('div.flex.items-center.px-2').forEach(el=&#62;&#123;const cloutEl=el.querySelector('.text-green-500, .text-red-500, [class*="text-green"], [class*="text-red"]');const clout=cloutEl?parseInt(cloutEl.textContent.replace(/[^\d-]/g,'')):0;const dateEl=el.querySelector('.opacity-60');const date=dateEl?dateEl.textContent.trim():'';const contentEl=el.querySelector('.flex-1.min-w-0');const content=contentEl?contentEl.textContent.trim():'';let user='you';let concept=null;let action='unknown';if(content.includes('You created a new bounty'))&#123;bounties.push(&#123;clout:Math.abs(clout),date&#125;);action='bounty';&#125;else if(content.includes('daily concept bounty'))&#123;action='daily_bounty';&#125;else if(content.includes('daily sign-in bonus'))&#123;action='daily_signin';&#125;else if(content.includes('You generated a new post draft'))&#123;action='draft_cost';&#125;else if(content.includes('You received a tip from'))&#123;const tipMatch=content.match(/tip from\s+(.+?)\s+for/);user=tipMatch?tipMatch[1]:'unknown';action='tip';&#125;else if(content.includes('liked your post')||content.includes('liked your song'))&#123;const likeMatch=content.match(/^(.+?)\s+liked/);user=likeMatch?likeMatch[1]:'unknown';action='like';&#125;else if(content.includes('used your concept'))&#123;const userMatch=content.match(/^(.+?)\s+used your concept/);user=userMatch?userMatch[1]:'unknown';const conceptMatch=content.match(/concept\s+[^\w\s]*(.+?)\s+to\s+(create|generate)/i);concept=conceptMatch?conceptMatch[1].trim():null;action=conceptMatch?conceptMatch[2]:'use';&#125;receipts.push(&#123;user:user.trim(),action,concept,clout,date,raw:content&#125;);&#125;);const data=&#123;receipts,bounties&#125;;navigator.clipboard.writeText(JSON.stringify(data)).then(()=&#62;alert`Copied $&#123;receipts.length&#125; receipts ($&#123;bounties.length&#125; bounties need tagging)! Paste into dashboard.`);&#125;)();
                        </code>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded p-4 border border-gray-700">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-300">go to your receipts page and click the bookmarklet</p>
                      <p className="text-gray-500 text-sm mt-1">this will copy your receipt data to clipboard</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded p-4 border border-gray-700">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-300">come back here and click the button above</p>
                      <p className="text-gray-500 text-sm mt-1">your data will load automatically</p>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}

        {receipts.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">total clout</p>
                <p className={`text-3xl font-bold ${totalClout >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalClout > 0 ? '+' : ''}{totalClout}¢
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">avg per action</p>
                <p className="text-3xl font-bold text-blue-400">{avgClout}¢</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">total actions</p>
                <p className="text-3xl font-bold text-purple-400">{filteredReceipts.length}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">unique users</p>
                <p className="text-3xl font-bold text-yellow-400">{Object.keys(userStats).length}</p>
              </div>
            </div>

            <div className="flex gap-2 mb-6 border-b border-gray-700">
              <button
                onClick={() => setActiveTab('concepts')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'concepts' 
                    ? 'text-green-400 border-b-2 border-green-400' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                concepts
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'analytics' 
                    ? 'text-green-400 border-b-2 border-green-400' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                analytics
              </button>
            </div>

            {activeTab === 'concepts' && conceptData.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-green-400">concept performance</h2>
                  {untaggedBounties.length > 0 && (
                    <div className="flex gap-2">
                      <span className="px-3 py-1 bg-yellow-900 text-yellow-300 rounded text-sm">
                        {untaggedBounties.length} untagged bounties
                      </span>
                      <button
                        onClick={() => setShowBountyModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                      >
                        tag bounties
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {conceptData.map((concept, i) => (
                    <div key={i} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">💡</span>
                        <h3 className="font-bold text-white truncate">{concept.name}</h3>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">total income</span>
                          <span className="text-green-400 font-bold">{concept.clout}¢</span>
                        </div>
                        
                        {concept.bountyWindows.length > 0 && (
                          <div className="border border-gray-700 rounded p-2 space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">💰 total bounty cost</span>
                              <span className="text-gray-300">{concept.bountyCost}¢</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">📈 24h window earnings</span>
                              <span className="text-blue-400">{concept.bountyEarnings}¢</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-gray-400">avg bounty roi</span>
                              <span className={concept.avgRoi >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {concept.avgRoi}%
                              </span>
                            </div>
                            <details className="text-xs">
                              <summary className="cursor-pointer text-blue-400 hover:text-blue-300">
                                {concept.bountyWindows.length} bounty window{concept.bountyWindows.length > 1 ? 's' : ''}
                              </summary>
                              <div className="mt-2 space-y-1 pl-2">
                                {concept.bountyWindows.map((window, wi) => (
                                  <div key={wi} className="flex justify-between text-gray-500">
                                    <span>{window.date.slice(0, 6)}: {window.amount}¢</span>
                                    <span className={window.roi >= 0 ? 'text-green-500' : 'text-red-500'}>
                                      +{window.earned}¢ ({window.roi}%)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}
                        
                        <div className="border-t border-gray-700 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400">net income</span>
                            <span className={`font-bold ${concept.netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {concept.netIncome > 0 ? '+' : ''}{concept.netIncome}¢
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-gray-400">👥 uses</span>
                          <span className="text-white">{concept.uses}</span>
                        </div>
                        
                        <div className="flex gap-2">
                          <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs">
                            {concept.paidUses} paid
                          </span>
                          <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                            {concept.freeUses} free
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-gray-400">📊 avg/use</span>
                          <span className="text-blue-400">{concept.avgPerUse}¢</span>
                        </div>
                        
                        <div className="mt-3">
                          <div className={`w-full py-1 rounded text-center text-xs font-bold ${
                            concept.profitable ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                          }`}>
                            {concept.profitable ? 'profitable' : `loss: ${concept.netIncome}¢`}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'analytics' && (
              <>
                <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
                  <h2 className="text-xl font-bold text-green-400 mb-4">cumulative clout flow</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={cloutFlow}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="label" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                        labelStyle={{ color: '#9ca3af' }}
                      />
                      <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="clout" stroke="#3b82f6" strokeWidth={1} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {timeOfDayData.length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
                    <h2 className="text-xl font-bold text-green-400 mb-4">best time to post</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={timeOfDayData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="hour" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                        />
                        <Bar dataKey="clout" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {topUsers.length > 0 && (
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <h2 className="text-xl font-bold text-green-400 mb-4">most active users</h2>
                      <div className="space-y-3">
                        {topUsers.map((user, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                                {i + 1}
                              </div>
                              <span className="text-gray-300">{user.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-32 bg-gray-700 rounded-full h-2">
                                <div 
                                  className="bg-blue-500 h-2 rounded-full" 
                                  style={{width: `${(user.count / topUsers[0].count) * 100}%`}}
                                />
                              </div>
                              <span className="text-blue-400 font-bold w-8 text-right">{user.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {topValueUsers.length > 0 && (
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <h2 className="text-xl font-bold text-green-400 mb-4">highest value users</h2>
                      <div className="space-y-3">
                        {topValueUsers.map((user, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                {i + 1}
                              </div>
                              <span className="text-gray-300">{user.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-32 bg-gray-700 rounded-full h-2">
                                <div 
                                  className="bg-purple-500 h-2 rounded-full" 
                                  style={{width: `${(user.clout / topValueUsers[0].clout) * 100}%`}}
                                />
                              </div>
                              <span className="text-purple-400 font-bold w-12 text-right">{user.clout}¢</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
                  <h2 className="text-xl font-bold text-green-400 mb-4">action breakdown</h2>
                  <div className="flex justify-center">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={actionData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {actionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            <div className="text-center space-x-4">
              <button
                onClick={handlePaste}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                update data
              </button>
              <button
                onClick={handleClear}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                clear all data
              </button>
            </div>
          </>
        )}

        {/* auth modal */}
        {showAuthModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
              <h3 className="text-xl font-bold text-green-400 mb-4">
                {authMode === 'signup' ? 'create account' : 'login'}
              </h3>
              
              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">simcluster username</label>
                    <input
                      type="text"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="w-full bg-gray-900 text-white border border-gray-700 rounded px-3 py-2"
                      placeholder="your simcluster username"
                      required
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-gray-400 text-sm mb-1">email</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-gray-900 text-white border border-gray-700 rounded px-3 py-2"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-1">password</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-gray-900 text-white border border-gray-700 rounded px-3 py-2"
                    placeholder="••••••••"
                    required
                  />
                </div>
                
                {authError && (
                  <p className="text-red-400 text-sm">{authError}</p>
                )}
                
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                  >
                    {authMode === 'signup' ? 'sign up' : 'login'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAuthModal(false);
                      setAuthError('');
                      setAuthEmail('');
                      setAuthPassword('');
                      setAuthUsername('');
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                  >
                    cancel
                  </button>
                </div>
                
                <div className="text-center text-sm text-gray-400">
                  {authMode === 'signup' ? (
                    <>
                      already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        login
                      </button>
                    </>
                  ) : (
                    <>
                      don't have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('signup')}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        sign up
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* bounty modal */}
        {showBountyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 border border-gray-700 max-h-[80vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-green-400 mb-4">tag bounties</h3>
              
              {untaggedBounties.length === 0 ? (
                <div className="text-gray-400 text-center py-8">
                  no untagged bounties! all set.
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-400 text-sm">
                    select a bounty and assign it to a concept
                  </p>
                  
                  {untaggedBounties.map((bounty, i) => (
                    <div 
                      key={i}
                      onClick={() => setSelectedBounty({...bounty, index: i})}
                      className={`p-4 rounded border cursor-pointer transition-colors ${
                        selectedBounty?.index === i 
                          ? 'border-blue-500 bg-gray-900' 
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-red-400 font-bold text-lg">-{bounty.clout}¢</div>
                          <div className="text-gray-500 text-sm">{bounty.date}</div>
                        </div>
                        {selectedBounty?.index === i && (
                          <div className="text-blue-400">✓ selected</div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {selectedBounty && (
                    <div className="pt-4 border-t border-gray-700">
                      <label className="block text-gray-400 text-sm mb-2">assign to concept</label>
                      <select
                        value={selectedConcept}
                        onChange={(e) => setSelectedConcept(e.target.value)}
                        className="w-full bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 mb-4"
                      >
                        <option value="">select a concept</option>
                        {conceptData.map((c, i) => (
                          <option key={i} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddBounty}
                          disabled={!selectedConcept}
                          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                        >
                          assign bounty
                        </button>
                        <button
                          onClick={() => {
                            setShowBountyModal(false);
                            setSelectedConcept('');
                            setSelectedBounty(null);
                          }}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                          close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ReceiptAnalytics />
    </AuthProvider>
  );
}