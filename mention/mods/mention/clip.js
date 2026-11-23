// Puts text on the clipboard for a moment and then restores everything that was there:
// text, images, file URLs, any type. Run detached: osascript -l JavaScript clip.js <text> <holdSeconds>
ObjC.import('AppKit');

function run(argv) {
  const text = argv[0] ?? '';
  const hold = Number(argv[1] ?? '1.2');
  const pb = $.NSPasteboard.generalPasteboard;

  // Snapshot every item with every type's data (copied eagerly, before we overwrite it).
  const saved = [];
  const items = pb.pasteboardItems;
  for (let i = 0; i < (items.isNil() ? 0 : items.count); i++) {
    const item = items.objectAtIndex(i);
    const types = item.types;
    const parts = [];
    for (let j = 0; j < types.count; j++) {
      const type = types.objectAtIndex(j);
      const data = item.dataForType(type);
      if (data && !data.isNil()) parts.push([type, data]);
    }
    if (parts.length) saved.push(parts);
  }

  pb.clearContents;
  pb.setStringForType($(text), 'public.utf8-plain-text');
  delay(hold);   // the mod pastes during this window

  pb.clearContents;
  if (saved.length) {
    const restored = $.NSMutableArray.array;
    for (const parts of saved) {
      const item = $.NSPasteboardItem.alloc.init;
      for (const [type, data] of parts) item.setDataForType(data, type);
      restored.addObject(item);
    }
    pb.writeObjects(restored);
  }
  delay(0.5);    // let the pasteboard server take the data before this process exits
  return 'ok';
}
