import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useKnowledge, useCreateDoc, useUpdateDoc, useDeleteDoc, useSyncWoo } from '../services/queries';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import { useToast } from '../components/ui/Toast';
import { KnowledgeCategory, KnowledgeDoc } from '../lib/types';

const categories: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'product', label: 'Product' },
  { value: 'faq', label: 'FAQ' },
  { value: 'policy', label: 'Policy' },
];

interface DocForm { title: string; content: string; category: KnowledgeCategory; }

export function KnowledgePage() {
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useKnowledge(category);
  const createDoc = useCreateDoc();
  const updateDoc = useUpdateDoc();
  const deleteDoc = useDeleteDoc();
  const sync = useSyncWoo();
  const { notify } = useToast();
  const { register, handleSubmit, reset } = useForm<DocForm>();

  const openCreate = () => {
    setEditing(null);
    reset({ title: '', content: '', category: 'faq' });
    setOpen(true);
  };

  const openEdit = (doc: KnowledgeDoc) => {
    setEditing(doc);
    reset({ title: doc.title, content: doc.content, category: doc.category });
    setOpen(true);
  };

  const onSubmit = (values: DocForm) => {
    if (editing) {
      updateDoc.mutate(
        { id: editing.id, title: values.title, content: values.content },
        { onSuccess: () => { notify('Document updated'); setOpen(false); } }
      );
    } else {
      createDoc.mutate(values, {
        onSuccess: () => { notify('Document created'); setOpen(false); },
      });
    }
  };

  const onSync = () => {
    sync.mutate(undefined, {
      onSuccess: (res) => {
        const parts: string[] = [];
        if (typeof res.synced === 'number') parts.push(`${res.synced} synced`);
        if (typeof res.created === 'number') parts.push(`${res.created} created`);
        if (typeof res.updated === 'number') parts.push(`${res.updated} updated`);
        notify(parts.length ? `Sync complete: ${parts.join(', ')}` : 'WooCommerce sync complete');
      },
      onError: () => notify('Sync failed', 'error'),
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Knowledge Base</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onSync} disabled={sync.isPending}>
            {sync.isPending ? 'Syncing…' : 'Sync WooCommerce'}
          </Button>
          <Button onClick={openCreate}>Add Document</Button>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        {categories.map((c) => (
          <Button
            key={c.value || 'all'}
            variant={category === c.value ? 'primary' : 'secondary'}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading && <p>Loading…</p>}
        {data?.docs.map((doc) => (
          <Card key={doc.id} className="flex items-start justify-between">
            <div>
              <div className="font-medium">{doc.title}</div>
              <div className="text-xs uppercase text-gray-400">{doc.category} · {doc.source}</div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{doc.content}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={() => openEdit(doc)}>Edit</Button>
              <Button
                variant="danger"
                onClick={() => deleteDoc.mutate(doc.id, { onSuccess: () => notify('Document deleted') })}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
        {data && data.docs.length === 0 && <p className="text-gray-500">No documents.</p>}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Document' : 'Add Document'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <Input {...register('title', { required: true })} />
          </div>
          {!editing && (
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                {...register('category', { required: true })}
              >
                <option value="product">Product</option>
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Content</label>
            <Textarea rows={5} {...register('content', { required: true })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createDoc.isPending || updateDoc.isPending}>Save</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
