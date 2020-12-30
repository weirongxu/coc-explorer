function! coc_explorer#mappings#register(mappings) abort
  let s:coc_explorer_mappings = a:mappings
  augroup CocExplorerMappings
    autocmd!
    autocmd FileType coc-explorer call coc_explorer#mappings#execute(s:coc_explorer_mappings)
  augroup END
endfunction

function! coc_explorer#mappings#execute(mappings) abort
  if &filetype == 'coc-explorer'
    for [mode, mapping] in items(a:mappings)
      for [key, target] in items(mapping)
        execute mode . 'map <buffer> ' . key . ' ' . target
      endfor
    endfor
  endif
endfunction

function! coc_explorer#mappings#clear(mappings) abort
  if &filetype == 'coc-explorer'
    for [mode, mapping] in items(a:mappings)
      for [key, target] in items(mapping)
        execute mode . 'unmap <buffer> ' . key
      endfor
    endfor
  endif
endfunction
