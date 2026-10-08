/* Add a class: a title and the class list, pasted from anywhere. */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseClassList, displayName, type ParsedClassList } from '@/yearbook/classList';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, parsed: ParsedClassList) => void;
  onSample: () => void;
}

const EXAMPLE = 'Adviser: Ms. Ana Reyes\n1. DELA CRUZ, Juan Miguel P.\n2. SANTOS, Maria B.\n3. RAMOS, Paolo';

export default function AddSectionDialog({ open, onClose, onCreate, onSample }: Props) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const parsed = useMemo(() => parseClassList(text), [text]);
  const titleMissing = !title.trim();
  const listMissing = parsed.students.length === 0;

  const create = () => {
    setTried(true);
    if (titleMissing || listMissing) return;
    onCreate(title.trim(), parsed);
    setTitle(''); setText(''); setTried(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a class</DialogTitle>
          <DialogDescription>Copy the names from Excel, Google Sheets or the SF1 and paste them below. Any order of columns works.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="yb-section-title">
              Class name
              <input id="yb-section-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grade 12 · St. Joseph" className="h-10 rounded-md border border-input bg-background px-3 text-base font-normal" />
              {tried && titleMissing ? <span className="text-xs font-normal text-red-700">Type the class name, for example “Grade 12 · St. Joseph”.</span> : null}
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="yb-class-list">
              Class list
              <textarea id="yb-class-list" value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} rows={12} className="rounded-md border border-input bg-background p-3 font-mono text-sm font-normal" />
              {tried && listMissing ? <span className="text-xs font-normal text-red-700">Paste at least one name.</span> : null}
            </label>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-sm">
            <p className="font-semibold">What Megy read</p>
            <p>{parsed.students.length} student{parsed.students.length === 1 ? '' : 's'}{parsed.adviser ? ' and the class adviser' : ''}</p>
            {parsed.adviser ? <p className="text-muted-foreground">Adviser: {[parsed.adviser.title, displayName(parsed.adviser.name)].filter(Boolean).join(' ')}</p> : null}
            <ul className="flex flex-col gap-0.5 text-muted-foreground">
              {parsed.students.slice(0, 8).map((s) => <li key={s.rosterOrder}>{s.last}, {s.first}{s.middle ? ` ${s.middle}` : ''}</li>)}
              {parsed.students.length > 8 ? <li>… and {parsed.students.length - 8} more</li> : null}
            </ul>
            {parsed.warnings.map((w) => <p key={w} className="text-amber-800">{w}</p>)}
          </div>
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button variant="link" className="px-0" onClick={onSample}>Use the sample class instead</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={create}>Add {parsed.students.length ? `${parsed.students.length} students` : 'the class'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
