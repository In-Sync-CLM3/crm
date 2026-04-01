 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthProvider";
 import { useOrgContext } from "@/hooks/useOrgContext";
 import { useEffect } from "react";
 
 export interface ConversationParticipant {
   user_id: string;
   is_admin: boolean;
   last_read_at: string;
   profile: {
     id: string;
     full_name: string | null;
     avatar_url: string | null;
   } | null;
 }
 
 export interface Conversation {
   id: string;
   org_id: string;
   conversation_type: "direct" | "group";
   name: string | null;
   created_by: string | null;
   last_message_at: string;
   created_at: string;
   participants: ConversationParticipant[];
   last_message?: {
     content: string | null;
     message_type: string;
     sender_id: string;
     created_at: string;
   } | null;
   unread_count: number;
 }
 
 export function useConversations() {
   const { user } = useAuth();
   const { effectiveOrgId } = useOrgContext();
   const queryClient = useQueryClient();
 
   const query = useQuery({
     queryKey: ["chat-conversations", user?.id, effectiveOrgId],
     queryFn: async (): Promise<Conversation[]> => {
       if (!user?.id || !effectiveOrgId) return [];
 
       // Get conversations where user is a participant
       const { data: participantData, error: participantError } = await supabase
         .from("chat_participants")
         .select("conversation_id")
         .eq("user_id", user.id);
 
       if (participantError) throw participantError;
       if (!participantData?.length) return [];
 
       const conversationIds = participantData.map((p) => p.conversation_id);
 
       // Get conversations with all details
       const { data: conversations, error: convError } = await supabase
         .from("chat_conversations")
         .select("*")
         .in("id", conversationIds)
         .eq("org_id", effectiveOrgId)
         .order("last_message_at", { ascending: false });
 
       if (convError) throw convError;
       if (!conversations?.length) return [];
 
       // Get all participants for these conversations
       const { data: allParticipants, error: partError } = await supabase
         .from("chat_participants")
         .select("*")
         .in("conversation_id", conversationIds);
 
       if (partError) throw partError;
 
       // Get profiles for all participants
       const userIds = [...new Set(allParticipants?.map((p) => p.user_id) || [])];
       const { data: profiles, error: profileError } = await supabase
         .from("profiles")
         .select("id, first_name, last_name, avatar_url")
         .in("id", userIds);
 
       if (profileError) throw profileError;
 
       const profileMap = new Map(
         profiles?.map((p) => [
           p.id,
           {
             id: p.id,
             full_name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || null,
             avatar_url: p.avatar_url,
           },
         ])
       );
 
       // Get last messages for ALL conversations in a single query (replaces N+1)
       const { data: allRecentMessages } = await supabase
         .from("chat_messages")
         .select("conversation_id, content, message_type, sender_id, created_at")
         .in("conversation_id", conversationIds)
         .order("created_at", { ascending: false });

       // Pick the most recent message per conversation
       const lastMessageMap = new Map<string, { content: string | null; message_type: string; sender_id: string; created_at: string }>();
       allRecentMessages?.forEach((msg) => {
         if (!lastMessageMap.has(msg.conversation_id)) {
           lastMessageMap.set(msg.conversation_id, {
             content: msg.content,
             message_type: msg.message_type,
             sender_id: msg.sender_id,
             created_at: msg.created_at,
           });
         }
       });

       // Get unread counts in a single query instead of N queries
       const userParticipantMap = new Map(
         allParticipants
           ?.filter((p) => p.user_id === user.id)
           .map((p) => [p.conversation_id, p.last_read_at])
       );

       // Find the oldest last_read_at as a lower bound for the single query
       const lastReadAts = Array.from(userParticipantMap.values()).filter(Boolean) as string[];
       const oldestLastReadAt = lastReadAts.length > 0
         ? lastReadAts.reduce((oldest, current) => (current < oldest ? current : oldest))
         : "1970-01-01";

       // Fetch all candidate unread messages in ONE query
       const { data: candidateUnreads } = await supabase
         .from("chat_messages")
         .select("conversation_id, created_at")
         .in("conversation_id", conversationIds)
         .neq("sender_id", user.id)
         .gt("created_at", oldestLastReadAt);

       // Count per conversation using each conversation's actual last_read_at
       const unreadCountMap = new Map<string, number>();
       candidateUnreads?.forEach((msg) => {
         const lastReadAt = userParticipantMap.get(msg.conversation_id) || "1970-01-01";
         if (msg.created_at > lastReadAt) {
           unreadCountMap.set(msg.conversation_id, (unreadCountMap.get(msg.conversation_id) || 0) + 1);
         }
       });
 
       // Build final conversation objects
       return conversations.map((conv) => {
         const participants: ConversationParticipant[] =
           allParticipants
             ?.filter((p) => p.conversation_id === conv.id)
             .map((p) => ({
               user_id: p.user_id,
               is_admin: p.is_admin || false,
               last_read_at: p.last_read_at || "",
               profile: profileMap.get(p.user_id) || null,
             })) || [];
 
         return {
           id: conv.id,
           org_id: conv.org_id,
           conversation_type: conv.conversation_type as "direct" | "group",
           name: conv.name,
           created_by: conv.created_by,
           last_message_at: conv.last_message_at || conv.created_at,
           created_at: conv.created_at,
           participants,
           last_message: lastMessageMap.get(conv.id) || null,
           unread_count: unreadCountMap.get(conv.id) || 0,
         };
       });
     },
     enabled: !!user?.id && !!effectiveOrgId,
     staleTime: 30000,
   });
 
   // Real-time subscription for conversation updates
   useEffect(() => {
     if (!user?.id || !effectiveOrgId) return;
 
     const channel = supabase
       .channel("chat-conversations-changes")
       .on(
         "postgres_changes",
         { event: "*", schema: "public", table: "chat_messages" },
         () => {
           queryClient.invalidateQueries({
             queryKey: ["chat-conversations", user.id, effectiveOrgId],
           });
         }
       )
       .on(
         "postgres_changes",
         { event: "*", schema: "public", table: "chat_participants" },
         () => {
           queryClient.invalidateQueries({
             queryKey: ["chat-conversations", user.id, effectiveOrgId],
           });
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
     };
   }, [user?.id, effectiveOrgId, queryClient]);
 
   const createConversationMutation = useMutation({
     mutationFn: async ({
       type,
       participantIds,
       name,
     }: {
       type: "direct" | "group";
       participantIds: string[];
       name?: string;
     }) => {
       if (!user?.id || !effectiveOrgId) throw new Error("Not authenticated");
 
       // For direct messages, check if conversation already exists
       if (type === "direct" && participantIds.length === 1) {
         const otherUserId = participantIds[0];
 
         // Get user's direct conversations
         const { data: userConvs } = await supabase
           .from("chat_participants")
           .select("conversation_id")
           .eq("user_id", user.id);
 
         if (userConvs?.length) {
           const convIds = userConvs.map((c) => c.conversation_id);
 
           // Check if other user is in any of these as a direct conversation
           const { data: otherUserConvs } = await supabase
             .from("chat_participants")
             .select("conversation_id")
             .eq("user_id", otherUserId)
             .in("conversation_id", convIds);
 
           if (otherUserConvs?.length) {
             // Check if any of these are direct conversations
             const { data: directConv } = await supabase
               .from("chat_conversations")
               .select("id")
               .in(
                 "id",
                 otherUserConvs.map((c) => c.conversation_id)
               )
               .eq("conversation_type", "direct")
               .limit(1)
               .single();
 
             if (directConv) {
               return directConv.id; // Return existing conversation
             }
           }
         }
       }
 
       // Create new conversation
       const { data: conv, error: convError } = await supabase
         .from("chat_conversations")
         .insert({
           org_id: effectiveOrgId,
           conversation_type: type,
           name: type === "group" ? name : null,
           created_by: user.id,
         })
         .select()
         .single();
 
       if (convError) throw convError;
 
       // Add creator as admin participant
       const { error: creatorError } = await supabase
         .from("chat_participants")
         .insert({
           conversation_id: conv.id,
           user_id: user.id,
           is_admin: true,
         });
 
       if (creatorError) throw creatorError;
 
       // Add other participants
       if (participantIds.length > 0) {
         const { error: partError } = await supabase
           .from("chat_participants")
           .insert(
             participantIds.map((uid) => ({
               conversation_id: conv.id,
               user_id: uid,
               is_admin: false,
             }))
           );
 
         if (partError) throw partError;
       }
 
       return conv.id;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({
         queryKey: ["chat-conversations", user?.id, effectiveOrgId],
       });
     },
   });
 
   return {
     conversations: query.data || [],
     isLoading: query.isLoading,
     error: query.error,
     refetch: query.refetch,
     createConversation: createConversationMutation.mutateAsync,
     isCreating: createConversationMutation.isPending,
   };
 }
 
 export function useTotalUnreadCount() {
   const { conversations } = useConversations();
   return conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
 }