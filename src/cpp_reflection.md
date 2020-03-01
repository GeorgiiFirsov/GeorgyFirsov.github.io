## C++14 reflection tricks

**Note 1:** actually there's no *true* reflection in C++14. There are some proposals with features, 
that allow you to reflect types in compile time, for instance with `reflexpr` keyword or using metaclasses,
but it is a future of C++ language. In this post I'll show you how to *simulate* it and do some magic
with POD-structures.

**Note 2:** (motivation). In my company I was standing in the front of one interesting task: to write a function,
that receives two raw pointers to structs and an id of a structure, that corresponds to a type of structs. The 
task was to compare two objects and dump the difference into XML. It looks like this:
```cpp
// We use WinAPI in our project
BSTR GetDiff(ETypeId id, const VOID* pOld, const VOID* pNew)
{
    switch(id)
    {
    case TYPE1:
        return GetDiffImpl(
            static_cast<const Type1*>(pOld), 
            static_cast<const Type1*>(pNew)
        );
    case TYPE2:
        ...
    }
}
```

The key-problem was to implement all the 19 variants of `GetDiffImpl`. They were implemented in simple way: I
went through each field by name and compare them. In case they are different values I write them into a map
like that:
```cpp
//                      tag name               old value    new value
//                          V                      V            V
using diff_t = std::map<std::string, std::pair<std::string, std::string>>;

... // in GetDiffImpl:

if (pOld->fieldN != pNew->fieldN) {
    diff["fieldN"] = std::make_pair(
        std::to_string(pOld->fieldN),
        std::to_string(pNew->fieldN)
    );
}
```

And such code was repeated for each field in structure. Seems like it is possible to do better. The key-problem
was that it was forbidden to modify structs somehow in old code. It made impossible to use Boost.Fusion with 
its macro adaptors. But actually I want to write it somehow like that:
```cpp
// in GetDiffImpl:

const auto old_tpl = ToTuple(*pOld);
const auto new_tpl = ToTuple(*pNew);

size_t index = 0;
for_each(zip(old_tpl, new_tpl), [&index](const auto& pair) 
{
    if (pair.first != pair.second) {
        diff[tags_map[index++]] = std::make_pair(
            std::to_string(pair.first), std::to_string(pair.second)
        );
    }
});

// thats it!
```

In current article I'll explain, how to make it possible.

----

### Part 1. Existing solutions

- Boost.Fusion was declined, as said before, because of impossibility to change written structs and moreover
because it was impossible to use Boost in our company's project for some reasons and requirements to projects.
- [magic_get](https://github.com/apolukhin/magic_get/) by Antony Polukhin was declined, because this library 
didn't compile in MSVC 19.16 with options set in our project (and it is impossible to change them, because of
requirements). But everything was fine with other options :( Actually this project was the turning-point to
in my thinking. My solution is based on it.

----

### Part 2. Implementation and ideas

First of all we need o remember, how data is placed in memory. It is true at least for MSVS 19.16 - 19.22.
We can just look at examples to recognize patterns:
```
short int char ----------+     char int char char ---------+     char { int char } char --------------+
 |     |---------------  |      |    |   |--------------+  |      |   |          |                    |
 +---        |  |  |  |  |      |    |------+--+--+--+  |  |      |   +------+   +------------------+ |
 v  v        v  v  v  v  v      v           v  v  v  v  v  v      v          |                      | v
[+][+][-][-][+][+][+][+][+]-   [+][-][-][-][+][+][+][+][+][+]-    [+][-][-][-][+][+][+][+][+][-][-][-][+]-
       ^  ^                ^       ^  ^  ^                   ^       ^  ^  ^                 ^  ^  ^     ^
       |  |                |       |  |  |                   |       |  |  |                 |  |  |     |
       ---+-----------------       ---+-----------------------       --------------+----------------------
       padding                     padding                                      padding
```

As we can see there are some paddings between data. They appear after small data types and structs to make their 
alignment to be an even number (usually to be a multiple of 4). It will be important, when we will try to reflect
structs with other structs inside. For now we'll leave this topic.

We want to convert struct into a tuple. As soon as we want it, we need to know types inside a struct, to instantiate
a tuple with them. The idea is to assign to all fundamental types an id an convert our struct firstly to compile-time
array of these ids and after that convert this array into a variadic type pack to specialize a tuple template. To 
support nested structures we will write type's id at position equal to sum of sizes of all previous types. Array size
will be sizeof(Type):
```
short: id = 7,  size = 2
int:   id = 8,  size = 4
char:  id = 11, size = 1

{ short, int, char }          <-> {  7,  0,  8,  0,  0,  0, 11,  0,  0,  0,  0,  0 }
{ char, int, char, char }     <-> { 11,  8,  0,  0,  0, 11, 11,  0,  0,  0,  0,  0 }
{ char, { int, char }, char } <-> { 11,  8,  0,  0,  0, 11,  0,  0,  0, 11,  0,  0 }
                                         |  array for nested struct  |
```

Right after that we shrink this array to get only ids without zeros. Than we just convert these ids back
into types. Shrinked array should be static too, so we need to know its size - we need to invent a way to
count fields in aggragate struct. Here comes aggregate initialization in C++:
```cpp
/* This code is going to compile only when n is less or equal to number 
of fields and each value is implicitly convertible into corresponding type */
T{ val_1, val_2, ... , val_n };
```

#### GetFieldsCount

Let's write some code for that:
```cpp
template<size_t /* _Idx */>
struct _Init {
    template<typename _Type>
    constexpr operator _Type();
};

template<typename _Type, size_t _Idx, size_t... _Idxs>
constexpr auto _GetFeldsCountImpl( std::index_sequence<_Idx, _Idxs...> ) noexcept
    -> decltype( _Type{ _Init<_Idx>{}, _Init<_Idxs>{}... }, size_t{ 0 } )
{ return sizeof...( _Idxs ) + 1; }

template<typename _Type, size_t... _Idxs>
constexpr size_t _GetFeldsCountImpl( std::index_sequence<_Idxs...> ) noexcept
{ return _GetFeldsCountImpl<_Type>( std::make_index_sequence<sizeof...( _Idxs ) - 1>{} ); }

template<typename _Type>
constexpr size_t GetFieldsCount() noexcept
{ return _GetFeldsCountImpl<_Type>( std::make_index_sequence<sizeof( _Type )>{} ); }
```

That's the first part! But what's happening here? The key is in two `_GetFeldsCountImpl` functions. 
The first one is more specialized, so compiler tries to use it first - it tries to initialize
type with concrete number of arguments and in case of success returns their count, otherwise by SFINAE
compiler uses the second function, that reduces number of arguments by one.

#### GetTypeIds

Now it's time to write `GetTypeIds` function. Let's write some more code!
```cpp
template<typename  _Type, size_t... _Idxs>
constexpr auto _GetIdsRaw_Impl( std::index_sequence<_Idxs...> ) noexcept
{
    constexpr SizeTArray<sizeof( _Type )>    idsRaw { { 0 } };
    constexpr SizeTArray<sizeof...( _Idxs )> offsets{ { 0 } };
    constexpr SizeTArray<sizeof...( _Idxs )> sizes  { { 0 } }; 

    constexpr _Type temporary1{
        _OffsetsInit<_Idxs, sizeof...( _Idxs )>{ 
            const_cast<size_t*>( offsets.data ), 
            const_cast<size_t*>( sizes.data ) 
        }...
    };

    constexpr _Type temporary2{ 
        _IndexedInit<_Idxs>{ const_cast<size_t*>( idsRaw.data + offsets.data[_Idxs] ) }... 
    };

    return idsRaw;
}

template<typename  _Type, size_t... _Idxs> 
constexpr auto _GetTypeIds_Impl( std::index_sequence<_Idxs...> indices ) noexcept
{
    constexpr auto idsRaw = _GetIdsRaw_Impl<_Type>( indices );
    constexpr SizeTArray<idsRaw.CountNonZeros()> idsWithoutZeros{ { 0 } };

    constexpr ArrayToNonZeros<sizeof( _Type )> transform{ 
        const_cast<size_t*>( idsRaw.data ), 
        const_cast<size_t*>( idsWithoutZeros.data ) 
    };
    transform.Run();

    return idsWithoutZeros;
}

template<typename _Type> 
constexpr decltype(auto) GetTypeIds() noexcept
{ return _GetTypeIds_Impl<_Type>( std::make_index_sequence<GetFieldsCount<_Type>()>{} ); }
```

This big amount of terrifying code does simple things: it just writes an array of ids with zero-paddings (see above)
in `_GetIdsRaw_Impl` and removes zeros after that by calling `Run` method of transformation algorithm. `_GetIdsRaw_Impl`
does following: it creates three static constexpr arrays of type `size_t` and fills them with sizes, offsets and finally
ids (with paddings) of internal types with all nested structs expanded. Structs `_OffsetsInit` and `_IndexedInit` are
modifications of struct `_Init` above. I'll not provide their code here in article, but you can find it on my GitHub.

Now we need to talk about ids. How to assign them to types? One way is to make like that:
```cpp
#define REFLECTION_REGISTER_TYPE( _Type, _Integer )                                                          \
    constexpr size_t _GetIdByType( IdenticalType<_Type> ) noexcept { return _Integer; }                      \
    constexpr _Type  _GetTypeById( SizeT<_Integer> ) noexcept { constexpr _Type result{}; return result; }
    
REFLECTION_REGISTER_TYPE( unsigned char ,  1 );
REFLECTION_REGISTER_TYPE( unsigned short,  2 );
REFLECTION_REGISTER_TYPE( unsigned int  ,  3 );
REFLECTION_REGISTER_TYPE( unsigned long ,  4 );
...
```

Now for each fundamental type we'll have two functions `_GetIdByType` and `_GetTypeById`. The first one is used in
`_IndexedInit` for example. The second one will help us to extract type back from array of ids. It will be used in
the next paragraph to construct a tuple.

#### ToTuple and for_each

Now we are ready to create the main function - the reason why I started to build this library. This function is `ToTuple`:

```cpp
template<typename  _Type, size_t... _Idxs> 
constexpr auto _ToTuple_Impl( const _Type& obj, std::index_sequence<_Idxs...> ) noexcept
{
    constexpr auto ids = GetTypeIds<_Type>();

    using tuple_t = Tuple<decltype( _GetTypeById( SizeT<get<_Idxs>( ids )>{} ) )...>;

    if (sizeof( tuple_t ) == sizeof( _Type )){
        auto pObj = static_cast<const void*>( &obj );
        return *static_cast<const tuple_t*>( pObj );
    }

    constexpr auto idsRaw = _GetIdsRaw_Impl<_Type>( 
        std::make_index_sequence<GetFieldsCount<_Type>()>{} 
    );

    constexpr SizeTArray<idsRaw.CountNonZeros()> offsets{ { 0 } };

    constexpr ArrayToIndices<idsRaw.Size()> transform{
        const_cast<size_t*>( idsRaw.data ),
        const_cast<size_t*>( offsets.data )
    };
    transform.Run();

    tuple_t tpl;
    size_t index = 0;

    auto PutAligned = [src = reinterpret_cast<const char*>( &obj ), &index, &offsets]( auto& element ) 
    {
        using element_t = typename std::decay<decltype( element )>::type;

        size_t offset = offsets.data[index++];
        while (offset % alignof( element_t ) != 0) offset++;

        element = *reinterpret_cast<const element_t*>( src + offset );
    };

    for_each( tpl, PutAligned );

    return tpl;
}

template<typename _Type> 
constexpr decltype(auto) ToTuple( const _Type& obj ) noexcept
{ return _ToTuple_Impl( obj, std::make_index_sequence<details::GetTotalFieldsCount<_Type>()>{} ); }
```

Here we meet similar part to `GetTypeIds` , but firstly let's consider with simple cases. The simple case is when we
have no nested structs inside our struct. In this case we have the same sizes of tuple and struct - they have the same
alignment, the same paddings at the same places, so we can just convert our object to tuple by applying `static_cast` to
it. 

The hard case is when we have nested structs. In this case we can get two arrays - with only ids and with ids and paddings.
These paddings are the minimal ones, so we need to tune them a bit in some cases, to make them match the requirement
`offset % alignof( element_t ) == 0`. In that case we use own `for_each` written for our implementation of tuple (tuple
is necessary to implement with own hand to ensure straight order of elements. 

Now let's write `for_each`:

```cpp
template<size_t _Idx = 0, typename _Func, typename _Tuple>
constexpr typename std::enable_if<_Idx == _Tuple::size>::type
for_each( const _Tuple& /* tpl */, _Func&& /* fn */ ) noexcept
{ }

template<size_t _Idx = 0, typename _Func, typename _Tuple>
constexpr typename std::enable_if<_Idx < _Tuple::size>::type 
for_each( const _Tuple& tpl, _Func&& fn )
{
    fn( get<_Idx>( tpl ) );
    for_each<_Idx + 1>( tpl, std::forward<_Func>( fn ) );
}
```

It is extremely simple it is just a recursive template function. Recursion ends on empty function when index is equal
to size of a tuple.

----

### Part 3. Usage

For now it impossible to write code like I wrote in **Note 2**, but we can do like that:

```cpp
const auto old_tpl = ToTuple(*pOld);
const auto new_tpl = ToTuple(*pNew);

CXml old_xml, new_xml;
size_t index = 0;

for_each( old_tuple, [&index, &old_xml, &tags_mapping]( const auto& element ) {
    old_xml.MakeTag( element, tags_mapping[index++] );
});
index = 0;
for_each( new_tuple, [&index, &new_xml, &tags_mapping]( const auto& element ) {
    new_xml.MakeTag( element, tags_mapping[index++] );
});

result = XmlDiff( old_xml, new_xml );
```

Where `tags_mapping` has, for instance, following type: `std::map<size_t, std::string>`, where `size_t` represents an index
in structure and `std::string` is a name of tag (name of field in structure for example). Isn't it cool and beautiful? The
main goal is, that this way we can implement almost all `GetDiffImpl` functions in the same way!

----

### Part 4. Disadvantages

- This method doesn't support arrays, unions, bit fields, non-POD types (nested too).
- This method works only on MSVC 19.16+ compiler.

----

In the next posts I'm going to improve this library with some other features to support a bit more structs.

----

[PodSerializer](https://github.com/GeorgyFirsov/PodSerializer) library on GitHub

Author: Georgy Firsov. 2020
