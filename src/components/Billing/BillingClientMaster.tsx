import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Check } from "lucide-react";
import { INDIAN_STATES } from "@/types/billing";
import type { BillingClient } from "@/types/billing";

interface BillingClientMasterProps {
  clients: BillingClient[];
  onAddClient: (client: Omit<BillingClient, "id">) => BillingClient;
  onUpdateClient: (id: string, updates: Partial<BillingClient>) => void;
}

const emptyForm = (): Partial<BillingClient> => ({
  company: "", first_name: "", last_name: "", email: "", phone: "",
  gstin: "", pan: "", billing_address: "", city: "", state: "",
  billing_state_code: "", pin_code: "", status: "active",
});

export function BillingClientMaster({ clients, onAddClient, onUpdateClient }: BillingClientMasterProps) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<BillingClient>>(emptyForm());

  const filtered = clients.filter(c =>
    c.company?.toLowerCase().includes(search.toLowerCase()) ||
    c.gstin?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.first_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (c: BillingClient) => { setEditing(c.id); setForm({ ...c }); setShowModal(true); };

  const handleSave = () => {
    if (editing) {
      onUpdateClient(editing, form);
    } else {
      onAddClient(form as Omit<BillingClient, "id">);
    }
    setShowModal(false);
  };

  const updateForm = (k: keyof BillingClient, v: string) => {
    const next = { ...form, [k]: v };
    if (k === "state") {
      const st = INDIAN_STATES.find(s => s.name === v);
      if (st) next.billing_state_code = st.code;
    }
    if (k === "gstin" && v.length >= 12) next.pan = v.substring(2, 12);
    setForm(next);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Billing Clients</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{clients.length} total clients</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Client</Button>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, GSTIN, or email..." className="pl-9" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[60px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No clients found</TableCell></TableRow>
            ) : (
              filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.company}</TableCell>
                  <TableCell>{c.first_name} {c.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.gstin}</TableCell>
                  <TableCell>{c.state}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {c.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Client" : "Add New Client"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Company Name <span className="text-red-500">*</span></Label>
              <Input value={form.company || ""} onChange={e => updateForm("company", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input value={form.first_name || ""} onChange={e => updateForm("first_name", e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={form.email || ""} onChange={e => updateForm("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone || ""} onChange={e => updateForm("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <Input value={form.gstin || ""} onChange={e => updateForm("gstin", e.target.value)} placeholder="e.g., 27AABCC1234D1Z5" />
            </div>
            <div className="space-y-1.5">
              <Label>PAN</Label>
              <Input value={form.pan || ""} onChange={e => updateForm("pan", e.target.value)} disabled={!!form.gstin && form.gstin.length >= 12} />
            </div>
            <div className="space-y-1.5">
              <Label>State <span className="text-red-500">*</span></Label>
              <Select value={form.state || ""} onValueChange={v => updateForm("state", v)}>
                <SelectTrigger><SelectValue placeholder="Select State" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map(s => (
                    <SelectItem key={s.code} value={s.name}>{s.code} - {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>State Code</Label>
              <Input value={form.billing_state_code || ""} disabled />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Input value={form.billing_address || ""} onChange={e => updateForm("billing_address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city || ""} onChange={e => updateForm("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>PIN Code</Label>
              <Input value={form.pin_code || ""} onChange={e => updateForm("pin_code", e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}><Check className="h-4 w-4 mr-1" />{editing ? "Update" : "Add"} Client</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
