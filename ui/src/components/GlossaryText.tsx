// Text with tap-to-explain glossary terms: each term is a real button that shows its meaning.
import { useId, useState } from "react";
import { splitGlossary } from "../model/glossary";

function Term({ text, definition }: { text: string; definition: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="term">
      <button type="button" className="term-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {text}
      </button>
      {open && <span id={id} className="term-definition" role="note"> ({definition})</span>}
    </span>
  );
}

export function GlossaryText({ text }: { text: string }) {
  return (
    <>
      {splitGlossary(text).map((s, i) => (s.term === null ? <span key={i}>{s.text}</span> : <Term key={i} text={s.text} definition={s.definition} />))}
    </>
  );
}
