"use client";

import React, { useState, useEffect } from "react";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";

import StarterKit from "@tiptap/starter-kit";

import EmojiPicker from "emoji-picker-react";
import { Button } from "@/components/ui/button";

interface MarkdownEditorProps {
  content: string;

  onContentChange: (newContent: string) => void;
}

const MarkdownEditor = ({ content, onContentChange }: MarkdownEditorProps) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },

        codeBlock: {
          HTMLAttributes: { class: "bg-black/80 rounded-md p-4 my-4 text-sm" },
        },
      }),
    ],

    content: content,

    immediatelyRender: false,

    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert prose-base max-w-none focus:outline-none p-4 break-words",
      },
    },

    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const onEmojiClick = (emojiObject: { emoji: string }) => {
    editor?.chain().focus().insertContent(emojiObject.emoji).run();

    setShowEmojiPicker(false);
  };

  if (!editor) {
    return null;
  }

  const Toolbar = () => (
    <div className="flex items-center gap-2 p-2 rounded-t-md bg-muted/40 border-b border-white/10 relative">
      <Button
        variant="outline"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive("bold") ? "bg-primary/20" : ""}
      >
        Bold
      </Button>

      <Button
        variant="outline"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive("italic") ? "bg-primary/20" : ""}
      >
        Italic
      </Button>

      <Button
        variant="outline"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive("codeBlock") ? "bg-primary/20" : ""}
      >
        Code
      </Button>

      <Button
        variant="outline"
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
      >
        Emoji
      </Button>

      {showEmojiPicker && (
        <div className="absolute top-12 z-10">
          <EmojiPicker onEmojiClick={onEmojiClick} />
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-lg border border-white/10 mt-4">
      <Toolbar />

      <EditorContent editor={editor} />
    </div>
  );
};

export default MarkdownEditor;
