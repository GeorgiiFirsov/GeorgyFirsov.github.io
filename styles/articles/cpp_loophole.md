## C++ Loophole

Continuation of my [article about static reflection in C++14](https://georgyfirsov.github.io/src/cpp_reflection.html).

**Note 1:** this technique is a bit magical, so it's not recommended for use in prodution code. 
There is an issue on [open-std.org](http://www.open-std.org):

>2118 <b>Stateful metaprogramming via friend injection</b><br><br>
><b>Section:</b> 17.7.5&nbsp;&nbsp;&nbsp;[temp.inject]&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
><b>Status:</b> open&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>Submitter:</b> Richard Smith
>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>Date:</b> 2015-04-27<br><br>
>Defining a friend function in a template, then referencing that function later provides a means of capturing and 
>retrieving metaprogramming state. This technique is arcane and should be made ill-formed.<br><br>
><b>Notes from the May, 2015 meeting:</b><br><br>
>CWG agreed that such techniques should be ill-formed, although the mechanism for prohibiting them is as yet undetermined.

Source: [C++ Standard Core Language Active Issues, Revision 100](http://www.open-std.org/jtc1/sc22/wg21/docs/cwg_active.html)

**Note 2:** there is another article about it. I found it after I discovered this technique by myself, but it helps me to
understand it better. It is a reason, why I think that this [article](https://alexpolt.github.io/type-loophole.html) 
by Alexandr Poltavsky must be mentioned here.

----

### Part 1. Basic principles

As soon as this article is labeled as <span class="label label-danger">Hardcore</span>, I will not describe the most basic
concepts as difference between declaration and definition of function, friend functions, auto deduction of return type, etc.

To understand this topic reader should clearly understand following points (they will be described in a nutshell below):
- template instantiation (when and how template classes are instantiated)
- friend function definition internals
- argument-dependent lookup (ADL)

##### Template instantiation and friend function definition internals

Consider following code:
```cpp
template<typename T>
struct MyStruct
{
    int foo() { ... };
};

MyStruct<int> obj{}; // (1)
```
At line marked as `(1)` I declare (and define) an object of type `MyStruct`. Compiler instantiates a new type `MyStruct<int>`.
That's it! No function `MyStruct<int>::foo` is instantiated. It appears if and only if I call it (not the case above).

Now look at following code:
```cpp
template<typename T>
struct MyStruct
{
    friend int foo( MyStruct<T> ) { ... };
};
```
This case differs from the first mentioned, because as soon as template `MyStruct` is instantiated, corresponding
friend function appears in the same scope with class definition (instantiated template). This function takes an argument
of type `MyStruct<T>`, so it can be found by ADL.

##### ADL

Here all you need to know is that ADL is a mechanism that makes possible to find a function in namespaces of its arguments.

----

### Part 2. How we can use all our knowledge to extract some advanced type infurmation?

Let's consider to use `_Type` as a type of structure that we want to reflect. Now we can define a template class:
```cpp
template<typename _Type, size_t _Idx>
struct Key
{
    constexpr friend auto GetValue( Key<_Type, _Idx> );
};
```
It will insert a declaration of friend function `GetValue` into a scope with instantiated template. As soon as this fucntion
is `constexpr` and has `auto` as return type it requires to be efined in the same scope. It will be provided by the next class
template:
```cpp
template<typename _Type, size_t _Idx, typename _ValueType>
struct RegisterValue
{
    constexpr friend auto GetValue( Key<_Type, _Idx> ) {
        return Identity<_Value>{};
    }
};
```
`Identity` is the same with `type_identity_t` from C++20, but here we have C++14, so we must use our own such template to
have light-weight wrapper over any type and be able to construct such value in compile-time.

So now we have two classes, that can help us to construct a compile-time mapping between struct type with indices of its
fields and types inside a struct. How we can do that? Here comes aggregate initialization:
```cpp
template<typename _Type, size_t   _Idx> 
struct _KVUniversalInit // KV for key-value
{
    template<typename _TypeField> 
    constexpr operator _TypeField() const noexcept
    {
        size_t dummy = sizeof( RegisterValue<_Type, _Idx, _TypeField> );
        return _TypeField{};
    }
};

template<typename  _Type, size_t... _Idxs> 
constexpr auto _GetTypeList_Impl( std::index_sequence<_Idxs...> )
{
    constexpr _Type tmp{ _KVUniversalInit<_Type, _Idxs>{}... };
    using tlist = decltype(
        Apply<_UnwindIdentity>( 
            type_list::TypeList<decltype( GetValue( Key<_Type, _Idxs>{} ) )...>{} 
        )
    );
    return tlist{};
};
```
Real library code is a bit more complicated, but the key idea is represented above. There is nothing special: we have a
modification of `_UniversalInit` struct to make it be able to construct a mapping between types, we use this struct to
aggregate initialize passed type. After that we call each `GetValue` with corresponding index, to create a tuple type.
Magical meta-call `Apply<_UnwindIdentity>( ... )` converts typelist `TypeList<Identity<type_1>, ... , Identity<type_n>>`
into a `TypeList<type_1, ... , type_n>`. I will not implement all typelist code in this article, but you can always
find it on my GitHub (link in the end of article). The last point is, that index sequence (argument of `_GetTypeList_Impl`)
must be constructed with `std::make_index_sequence<N>{}`, where `N` is exact number of fields in our structure. How to
get this number I wrote in my previous article.

So... We can now convert structure type into a typelist with internal types. Having a `TypeList<_Types...>` we can easily
construct `Tuple<_Types...>`. I called this method `ToTuplePrecise`, because it constructs a tuple with precisely the same
types as in original structure. Here is internal implementation:
```cpp
template<typename _Type> 
constexpr decltype(auto) _ToTuplePrecise_Impl( const _Type& obj )
{
    using tlist_t = decltype( GetTypeList<_Type>() );
    using tuple_t = decltype( TupleType( std::declval<tlist_t>() ) );
    
    auto pObj = static_cast<const void*>( &obj );
    return *static_cast<const tuple_t*>( pObj );
}
```
That's it! It is really simple. Isn't it a power of templates and metaprogramming? I found it insane. Because here we have
exactly the same types inside a tuple, it has the same layout as original struct in every case, so here we can just cast
them between each other.

----

### Part 3. Usage

For now we can write the following code and it will work!
```cpp
#include "StreamOperators.h"
#include "Reflection.h"
#include "Tuple.h"

using namespace io_operators;

struct Person 
{
    std::string m_name;
    size_t m_age;
};

// ...

Person bob{ "Bob", 45 };

std::cout << bob;                     // will print: Bob, 45
std::cout << beautiful_struct << bob; // will print: { Bob, 45 }

auto bob_tpl = ToTuplePrecise( bob );

// Will print: Bob is 45 years old.
std::cout << types::get<0>( bob_tpl ) << " is " 
          << types::get<1>( bob_tpl ) << " years old." << std::endl;
```
It works, because PodSerializer library overloads operators `>>` and `<<` for `std::basic_istream` and `std::basic_ostream`
respectively. It also implements some other features for streams in C++.

As we can see, loophole technique allows us to reflect not only POD's, but some non-POD's too. It's amazing!
This technique makes possible to construct an universal serializer for the same set of types. PodSerializer library
provides `StringStreamSerializer` with `StringStreamBuffer` (and their wide-char analogues), that support almost all
aggregate types. Here is an example:
```cpp
#include "Serialization.h"

using serialization::StringStreamSerializer;
using serialization::StringStreamBuffer;

struct NotPod
{
    char field1;
    std::string field2;
    double field3;
};

// ...

NotPod original{ 'a', "Serialized string", 3.14 };

StringStreamSerializer<NotPod> serializer;
StringStreamBuffer<NotPod> buffer;

assert( buffer.IsEmpty() == true );

serializer.Serialize( original, buffer );

assert( buffer.IsEmpty() == flase );

NotPod loaded{ 'b', "Another string", 2.71 };

assert( loaded.field1 != original.field1 );
assert( loaded.field2 != original.field2 );
assert( loaded.field3 != original.field3 );

serializer.Deserialize( loaded, buffer );

assert( loaded.field1 == original.field1 );
assert( loaded.field2 == original.field2 );
assert( loaded.field3 == original.field3 );
```

----

[PodSerializer](https://github.com/GeorgyFirsov/PodSerializer) library on GitHub

Author: Georgy Firsov. 2020
