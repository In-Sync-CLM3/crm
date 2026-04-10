import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface ICPArrayEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function ICPArrayEditor({
  label,
  values,
  onChange,
  placeholder = "Type and press Enter to add",
}: ICPArrayEditorProps) {
  const [inputValue, setInputValue] = useState("");

  const addTag = () => {
    const tag = inputValue.trim();
    if (tag && !values.includes(tag)) {
      onChange([...values, tag]);
    }
    setInputValue("");
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && inputValue === "" && values.length > 0) {
      removeTag(values[values.length - 1]);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="min-h-[38px] flex flex-wrap gap-1.5 items-center border rounded-md px-2 py-1.5 bg-background focus-within:ring-1 focus-within:ring-ring">
        {values.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-[10px] gap-1 pr-1"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full hover:bg-muted-foreground/20 p-0.5"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={values.length === 0 ? placeholder : ""}
          className="border-0 p-0 h-auto text-xs shadow-none focus-visible:ring-0 flex-1 min-w-[120px]"
        />
      </div>
    </div>
  );
}
