import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';

const ADMIN_EMAILS = ['sajol@nextventures.io', 'sazzad@nextventures.io', 'salmanwahid@nextventures.io', 'dhrubo@nextventures.io', 'sajolmk999@gmail.com', 'afsana@nextventures.io', 'sudipta@nextventures.io', 'walliullah@nextventures.io'];

const AthenaPermissionContext = createContext(null);

export const useAthenaPermission = () => {
  const ctx = useContext(AthenaPermissionContext);
  if (!ctx) throw new Error('useAthenaPermission must be used within AthenaPermissionProvider');
  return ctx;
};

export const AthenaPermissionProvider = ({ children }) => {
  const { user } = useAuth();
  const userEmail = user?.email?.toLowerCase() || null;
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);

  const [allowedEmails, setAllowedEmails] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('athena_permissions')
      .select('email, added_by, added_at')
      .order('added_at', { ascending: false });
    if (error) {
      console.warn('[athena-permissions] load failed:', error.message);
      setAllowedEmails([]);
    } else {
      setAllowedEmails(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const isAllowed = useCallback((email) => {
    if (!email) return false;
    const e = email.toLowerCase();
    if (ADMIN_EMAILS.includes(e)) return true;
    return allowedEmails.some(r => (r.email || '').toLowerCase() === e);
  }, [allowedEmails]);

  const canUseAthena = isAdmin || isAllowed(userEmail);

  const addEmail = useCallback(async (email) => {
    const e = email.trim().toLowerCase();
    if (!e) return { error: 'Email required' };
    const { error } = await supabase
      .from('athena_permissions')
      .insert({ email: e, added_by: userEmail });
    if (!error) await refresh();
    return { error: error?.message || null };
  }, [userEmail, refresh]);

  const removeEmail = useCallback(async (email) => {
    const { error } = await supabase
      .from('athena_permissions')
      .delete()
      .eq('email', email.toLowerCase());
    if (!error) await refresh();
    return { error: error?.message || null };
  }, [refresh]);

  const value = {
    loading,
    isAdmin,
    canUseAthena,
    allowedEmails,
    adminEmails: ADMIN_EMAILS,
    refresh,
    addEmail,
    removeEmail,
    isAllowed,
  };

  return (
    <AthenaPermissionContext.Provider value={value}>
      {children}
    </AthenaPermissionContext.Provider>
  );
};

export default AthenaPermissionContext;
