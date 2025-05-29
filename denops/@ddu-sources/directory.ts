import {
  BaseSource,
  Context,
  Item,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v3.10.1/types.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v3.10.1/deps.ts";
import { join } from "jsr:@std/path@~1.0.3/join";
import { abortable } from "jsr:@std/async@~1.0.4/abortable";
import { resolve } from "jsr:@std/path@~1.0.3/resolve";
import { treePath2Filename } from "jsr:@shougo/ddu-vim@~6.1.0/utils";

type Params = {
  expandSymbolicLink: boolean;
  globalDirs: Item[];
};

export class Source extends BaseSource<Params> {
  override kind = "directory";

  override gather(args: {
    denops: Denops;
    context: Context;
    sourceOptions: SourceOptions;
    sourceParams: Params;
  }): ReadableStream<Item[]> {
    const abortController = new AbortController();
    return new ReadableStream<Item[]>({
      async start(controller) {
        const root = treePath2Filename(
          args.sourceOptions.path.length != 0
            ? args.sourceOptions.path
            : args.context.path,
        );
        controller.enqueue(
          await collectDirs(
            resolve(root),
            abortController.signal,
            args.sourceParams.expandSymbolicLink,
            args.sourceParams.globalDirs,
          ),
        );
        controller.close();
      },
    });
  }

  override params(): Params {
    return {
      expandSymbolicLink: false,
      globalDirs: [],
    };
  }
}

async function collectDirs(
  dir: string,
  signal: AbortSignal,
  expandSymbolicLink: boolean,
  globalDirs: Item[],
) {
  const items: Item[] = [];

  for await (
    const item of (abortable(Deno.readDir(dir), signal))
  ) {
    const abspath = join(dir, item.name);
    const stat = await readStat(abspath, expandSymbolicLink);
    if (stat === null) {
      // Skip invalid files
      continue;
    }

    if (stat.isDirectory) {
      items.push({
        word: join(item.name, "/"),
        action: {
          path: join(dir, item.name),
        },
      });
    }
  }

  for (const i of globalDirs) {
    items.push(i);
  }

  items.push({
    word: "../",
    action: {
      path: join(dir, ".."),
    },
  });

  return items;
}

async function readStat(
  path: string,
  expandSymbolicLink: boolean,
): Promise<Deno.FileInfo | null> {
  try {
    const stat = await Deno.lstat(path);
    if (stat.isSymlink && expandSymbolicLink) {
      return {
        ...(await Deno.stat(path)),
        isSymlink: true,
      };
    }
    return stat;
  } catch (_: unknown) {
    // Ignore stat exception
    return null;
  }
}
